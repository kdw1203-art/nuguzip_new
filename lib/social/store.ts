import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * 릴스·쇼츠 업로드 큐 저장소 — `public.social_uploads` (서비스롤 전용, RLS deny-all).
 *
 * 대상별 상태를 분리해 둔 이유: IG 만 성공하고 YT 가 실패하는 반쪽 성공이
 * 흔한데, 상태가 하나면 재시도가 성공분을 중복 발행한다. 재시도는 실패한
 * 대상만 다시 집행한다.
 */

export type TargetStatus = "off" | "queued" | "uploading" | "published" | "failed";

export type SocialUpload = {
  id: string;
  createdAt: string;
  createdBy: string | null;
  videoUrl: string;
  title: string;
  caption: string;
  hashtags: string[];
  scheduledAt: string;
  igStatus: TargetStatus;
  ytStatus: TargetStatus;
  igMediaId: string | null;
  ytVideoId: string | null;
  igError: string | null;
  ytError: string | null;
  attempts: number;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRow(r: any): SocialUpload {
  return {
    id: r.id,
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
    videoUrl: r.video_url,
    title: r.title,
    caption: r.caption ?? "",
    hashtags: r.hashtags ?? [],
    scheduledAt: r.scheduled_at,
    igStatus: r.ig_status,
    ytStatus: r.yt_status,
    igMediaId: r.ig_media_id ?? null,
    ytVideoId: r.yt_video_id ?? null,
    igError: r.ig_error ?? null,
    ytError: r.yt_error ?? null,
    attempts: r.attempts ?? 0,
  };
}

const MAX_ATTEMPTS = 5;

export async function enqueueUpload(input: {
  videoUrl: string;
  title: string;
  caption: string;
  hashtags: string[];
  scheduledAt?: string;
  targets: { instagram: boolean; youtube: boolean };
  createdBy: string;
}): Promise<SocialUpload> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 미구성");
  const { data, error } = await sb
    .from("social_uploads")
    .insert({
      video_url: input.videoUrl,
      title: input.title,
      caption: input.caption,
      hashtags: input.hashtags,
      scheduled_at: input.scheduledAt ?? new Date().toISOString(),
      ig_status: input.targets.instagram ? "queued" : "off",
      yt_status: input.targets.youtube ? "queued" : "off",
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(`큐 등록 실패: ${error.message}`);
  return toRow(data);
}

export async function listUploads(limit = 50): Promise<SocialUpload[]> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 미구성");
  const { data, error } = await sb
    .from("social_uploads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`큐 조회 실패: ${error.message}`);
  return (data ?? []).map(toRow);
}

/**
 * 집행 대상 1건을 집어 `uploading` 으로 잠근다.
 * 반환 null = 지금 집행할 것이 없다(빈 큐와 조회 실패는 throw 로 구분).
 */
export async function claimNextDue(): Promise<SocialUpload | null> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 미구성");
  const { data, error } = await sb
    .from("social_uploads")
    .select("*")
    .or("ig_status.eq.queued,yt_status.eq.queued")
    .lte("scheduled_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("scheduled_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`큐 조회 실패: ${error.message}`);
  const row = data?.[0];
  if (!row) return null;
  const patch: Record<string, unknown> = {
    attempts: (row.attempts ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
  if (row.ig_status === "queued") patch.ig_status = "uploading";
  if (row.yt_status === "queued") patch.yt_status = "uploading";
  const { data: locked, error: lockErr } = await sb
    .from("social_uploads")
    .update(patch)
    .eq("id", row.id)
    .eq("attempts", row.attempts) // 다른 드레인과의 경합 방지(낙관적 잠금)
    .select("*")
    .single();
  if (lockErr || !locked) return null; // 경합에서 짐 — 다음 크론이 잡는다
  return toRow(locked);
}

export async function markTargetResult(
  id: string,
  target: "ig" | "yt",
  result: { ok: true; externalId: string } | { ok: false; error: string; retryable: boolean },
): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 미구성");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (result.ok) {
    patch[`${target}_status`] = "published";
    patch[`${target}_${target === "ig" ? "media" : "video"}_id`] = result.externalId;
    patch[`${target}_error`] = null;
  } else {
    /* 재시도 가능(자격 증명 미설정·일시 오류)이면 queued 로 되돌린다 —
       attempts 는 claim 시점에 이미 셌으므로 5회를 넘으면 자연히 멈춘다. */
    patch[`${target}_status`] = result.retryable ? "queued" : "failed";
    patch[`${target}_error`] = result.error.slice(0, 500);
  }
  const { error } = await sb.from("social_uploads").update(patch).eq("id", id);
  if (error) throw new Error(`상태 기록 실패: ${error.message}`);
}
