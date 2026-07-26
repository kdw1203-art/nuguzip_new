/**
 * meetings (모임) Supabase 백엔드.
 * Supabase 미설정 시 파일 기반 폴백으로 자동 전환.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { filterPublicContent } from "@/lib/content/public-content-filter";
import {
  readGroupsFile,
  prependGroupFile,
  getGroupFile,
} from "@/lib/groups-store-file";
import type { GroupMeetup } from "@/lib/types/group";

/** DB 직접 접근이 가능한 full meeting record. 기존 GroupMeetup 필드 + DB 추가 필드. */
export type UserMeeting = GroupMeetup & {
  organizerEmail: string;
  organizerLabel: string;
  /** 지역 (예: "서울특별시 강남구") */
  region: string;
  /** 카테고리 (예: "스터디", "임장") */
  category: string;
  /** 현재 참여 인원 */
  currentMembers: number;
  /** 예정 일시 ISO 문자열 (nullable) */
  scheduledAt: string | null;
  /** 상태: open | closed | cancelled | completed */
  status: "open" | "closed" | "cancelled" | "completed";
  /** 참가비 (원) */
  fee: number;
  /** 공개 여부 */
  isPublic: boolean;
  /** 유료·패스 모임 여부 (DB `is_premium` 호환) */
  isPremium: boolean;
  /** 카드 그라디언트 클래스 */
  gradient?: string | null;
  /** 체크리스트 항목 */
  checklist: string[];
};

function mapRow(r: Record<string, unknown>): UserMeeting {
  const region = String(r.region ?? r.district ?? "");
  const city = region.split(" ")[0] ?? "서울특별시";
  const district = region.split(" ").slice(1).join(" ") || region;
  return {
    // GroupMeetup 필드
    id: String(r.id ?? ""),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    city,
    district,
    hostLabel: String(r.organizer_label ?? r.hostLabel ?? "주최자"),
    meetType: String(r.category ?? r.meetType ?? "스터디"),
    maxMembers: Number(r.max_members ?? r.maxMembers ?? 30),
    memberCount: Number(r.current_members ?? r.currentMembers ?? r.memberCount ?? 1),
    nextAt: r.scheduled_at ? String(r.scheduled_at) : null,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    createdAt: String(r.created_at ?? r.createdAt ?? new Date().toISOString()),
    // UserMeeting 추가 필드
    organizerEmail: String(r.organizer_email ?? r.organizerEmail ?? ""),
    organizerLabel: String(r.organizer_label ?? r.organizerLabel ?? "주최자"),
    region,
    category: String(r.category ?? r.meetType ?? "스터디"),
    currentMembers: Number(r.current_members ?? r.currentMembers ?? r.memberCount ?? 1),
    scheduledAt: r.scheduled_at ? String(r.scheduled_at) : null,
    status: (["open", "closed", "cancelled", "completed"].includes(String(r.status))
      ? r.status
      : "open") as UserMeeting["status"],
    fee: Number(r.fee ?? 0),
    isPublic: r.is_public !== false,
    isPremium: Boolean(r.is_premium ?? r.isPremium ?? false),
    gradient: r.gradient ? String(r.gradient) : null,
    checklist: Array.isArray(r.checklist) ? (r.checklist as string[]) : [],
  };
}

/** 지난 모임(scheduled_at < now) 여부 — 일정 미정(null)은 지난 모임으로 보지 않는다. */
export function isPastMeeting(m: UserMeeting, now = Date.now()): boolean {
  if (!m.scheduledAt) return false;
  const ts = Date.parse(m.scheduledAt);
  return Number.isFinite(ts) && ts < now;
}

/**
 * 모임 목록.
 * 기본값은 지난 모임(scheduled_at < now)을 제외한다 — 검색·랜딩 등 일반 소비처가
 * 이미 끝난 모임을 "모집 중"처럼 노출하지 않도록. 지난 모임까지 필요한 화면
 * (예: /town/groups 의 "지난 모임" 접힌 섹션)만 includePast 를 켠다.
 */
export async function listMeetings(
  opts: { includePast?: boolean } = {},
): Promise<UserMeeting[]> {
  const sb = getServiceSupabase();
  let rows: UserMeeting[];
  if (!sb) {
    rows = filterPublicContent((await readGroupsFile()).map((g) => mapRow(g as unknown as Record<string, unknown>)));
  } else {
    const { data, error } = await sb
      .from("meetings")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(200);
    rows = error
      ? filterPublicContent((await readGroupsFile()).map((g) => mapRow(g as unknown as Record<string, unknown>)))
      : filterPublicContent((data ?? []).map(mapRow));
  }
  if (opts.includePast) return rows;
  const now = Date.now();
  return rows.filter((m) => !isPastMeeting(m, now));
}

export async function getMeeting(id: string): Promise<UserMeeting | null> {
  const sb = getServiceSupabase();
  if (!sb) {
    const g = await getGroupFile(id);
    return g ? mapRow(g as unknown as Record<string, unknown>) : null;
  }
  const { data, error } = await sb
    .from("meetings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    /* 파일 스토어에는 시드 모임이 들어 있으니 먼저 거기서 찾아본다. */
    const g = await getGroupFile(id);
    if (g) return mapRow(g as unknown as Record<string, unknown>);
    /* 여기까지 왔는데 error 가 있었다면, 우리는 "이 모임이 없다"를 확인한 게
       아니라 **확인에 실패한** 것이다. null 을 돌려주면 호출부가 삭제된 모임과
       똑같은 화면을 200 으로 그린다. 둘은 다른 사실이므로 던진다(→ 5xx). */
    if (error) {
      throw new Error(
        `[meetings.getMeeting] 모임 ${id} 조회 실패: ${error.message ?? "unknown"}`,
      );
    }
    return null;
  }
  return mapRow(data as Record<string, unknown>);
}

export async function createMeeting(input: {
  organizerEmail: string;
  organizerLabel: string;
  title: string;
  description: string;
  region: string;
  category?: string;
  scheduledAt?: string | null;
  maxMembers?: number;
  fee?: number;
  isPublic?: boolean;
  tags?: string[];
}): Promise<UserMeeting> {
  const sb = getServiceSupabase();

  const payload = {
    organizer_email: input.organizerEmail,
    organizer_label: input.organizerLabel,
    title: input.title,
    description: input.description,
    region: input.region,
    category: input.category ?? "스터디",
    scheduled_at: input.scheduledAt ?? null,
    max_members: input.maxMembers ?? 30,
    current_members: 1,
    fee: input.fee ?? 0,
    is_public: input.isPublic ?? true,
    tags: input.tags ?? [],
    status: "open",
  };

  if (!sb) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const regionParts = input.region.split(" ");
    const g: GroupMeetup = {
      id,
      title: input.title,
      description: input.description,
      city: regionParts[0] ?? "서울특별시",
      district: regionParts.slice(1).join(" ") || input.region,
      hostLabel: input.organizerLabel,
      meetType: input.category ?? "스터디",
      maxMembers: input.maxMembers ?? 30,
      memberCount: 1,
      nextAt: input.scheduledAt ?? null,
      tags: input.tags ?? [],
      createdAt: now,
    };
    await prependGroupFile(g);
    return mapRow({ ...g, organizer_email: input.organizerEmail, status: "open", fee: input.fee ?? 0, is_public: input.isPublic ?? true } as Record<string, unknown>);
  }

  const { data, error } = await sb
    .from("meetings")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function joinMeeting(
  meetingId: string,
  _userEmail: string,
): Promise<{ ok: boolean; message?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "Supabase 미설정" };

  // 현재 멤버수 확인
  const { data: meeting } = await sb
    .from("meetings")
    .select("current_members, max_members, status")
    .eq("id", meetingId)
    .maybeSingle();

  if (!meeting) return { ok: false, message: "모임을 찾을 수 없습니다." };
  if (meeting.status === "cancelled")
    return { ok: false, message: "취소된 모임입니다." };
  if (meeting.status !== "open") return { ok: false, message: "마감된 모임입니다." };
  if (meeting.current_members >= meeting.max_members)
    return { ok: false, message: "정원이 초과되었습니다." };

  const { error } = await sb
    .from("meetings")
    .update({ current_members: meeting.current_members + 1 })
    .eq("id", meetingId);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function cancelMeeting(
  meetingId: string,
  actorEmail: string,
): Promise<{ ok: boolean; message?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "Supabase 미설정" };
  const { error } = await sb
    .from("meetings")
    .update({ status: "cancelled" })
    .eq("id", meetingId)
    .eq("organizer_email", actorEmail);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
