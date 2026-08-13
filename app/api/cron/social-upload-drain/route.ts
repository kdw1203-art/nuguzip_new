/**
 * GET/POST /api/cron/social-upload-drain — 릴스·쇼츠 업로드 큐 집행 (1건/호출).
 *
 * 호출원: pg_cron `social-upload-drain` (15분마다, vault 의 cron_secret 으로 인증).
 * 1건씩만 집행하는 이유: 유튜브는 영상 바이트 업로드라 한 건에 수십 초~수 분이
 * 걸리고, 함수 상한(300초) 안에서 확실히 끝나는 단위가 1건이다. 큐가 밀려도
 * 15분 간격 × 1건 = 하루 96건 — 유튜브 일일 쿼터(6건)보다 훨씬 크다.
 *
 * 사실 우선: 자격 증명 미설정은 failed 가 아니라 queued 유지 + 사유 기록이다.
 * env 를 채우면 다음 크론이 그대로 잇는다. attempts 5회 초과 행은 집행 대상에서
 * 빠진다(무한 재시도로 쿼터를 태우지 않기 위해).
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { claimNextDue, markTargetResult } from "@/lib/social/store";
import { publishReel } from "@/lib/social/instagram";
import { uploadShort } from "@/lib/social/youtube";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  let job;
  try {
    job = await claimNextDue();
  } catch (e) {
    // 조회 실패를 "큐 비었음"으로 위장하지 않는다
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ ok: true, processed: 0, note: "집행 대상 없음" });
  }

  const caption = [job.caption, job.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")]
    .filter(Boolean)
    .join("\n\n");

  const results: Record<string, unknown> = { id: job.id, attempts: job.attempts };

  if (job.igStatus === "uploading") {
    const r = await publishReel({ videoUrl: job.videoUrl, caption });
    await markTargetResult(job.id, "ig", r.ok ? { ok: true, externalId: r.mediaId } : r);
    results.instagram = r.ok ? { published: r.mediaId } : { error: r.error, retryable: r.retryable };
    if (!r.ok) logger.warn("[social:drain] IG 실패", job.id, r.error);
  }

  if (job.ytStatus === "uploading") {
    const r = await uploadShort({
      videoUrl: job.videoUrl,
      title: job.title,
      description: caption,
      tags: job.hashtags,
    });
    await markTargetResult(job.id, "yt", r.ok ? { ok: true, externalId: r.videoId } : r);
    results.youtube = r.ok ? { published: r.videoId } : { error: r.error, retryable: r.retryable };
    if (!r.ok) logger.warn("[social:drain] YT 실패", job.id, r.error);
  }

  return NextResponse.json({ ok: true, processed: 1, ...results, finishedAt: new Date().toISOString() });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
