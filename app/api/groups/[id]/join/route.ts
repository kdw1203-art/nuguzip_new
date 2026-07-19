import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getMeeting } from "@/lib/meetings/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export type GroupMemberStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface GroupMember {
  id: string;
  meetingId: string;
  userEmail: string;
  userName: string | null;
  message: string | null;
  status: GroupMemberStatus;
  joinedAt: string;
}

/** Supabase/PostgREST 원본(영문) 오류를 사용자에게 보여줄 한국어 메시지로 변환 */
function friendlyDbError(error: { message?: string; code?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  if (error?.code === "23505") return "이미 신청하셨습니다.";
  if (/schema cache|could not find the .* column|column .* does not exist/i.test(msg)) {
    return "모임 참여 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (/violates check constraint/i.test(msg)) {
    return "참여 상태 값이 올바르지 않습니다.";
  }
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function mapRow(r: Record<string, unknown>): GroupMember {
  return {
    id: String(r.id ?? ""),
    meetingId: String(r.meeting_id ?? ""),
    userEmail: String(r.user_email ?? ""),
    userName: r.user_name ? String(r.user_name) : null,
    message: r.message ? String(r.message) : null,
    status: (r.status as GroupMemberStatus) ?? "pending",
    joinedAt: String(r.joined_at ?? new Date().toISOString()),
  };
}

/** 인메모리 폴백 (Supabase 미설정) */
const memStore = new Map<string, GroupMember[]>();

function memKey(meetingId: string) {
  return meetingId;
}

/** GET /api/groups/[id]/join — 참여 신청 목록 (본인 또는 주최자) */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const email = session.user.email;

  const sb = getServiceSupabase();
  if (!sb) {
    const all = memStore.get(memKey(id)) ?? [];
    const members = all.filter((m) => m.userEmail === email);
    return NextResponse.json({ members });
  }

  const group = await getMeeting(id);
  const isOrganizer = group?.organizerEmail === email;

  const query = sb
    .from("group_members")
    .select("*")
    .eq("meeting_id", id)
    .order("joined_at", { ascending: false });

  if (!isOrganizer) {
    query.eq("user_email", email);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[groups/join] GET error:", error.message);
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 });
  }
  return NextResponse.json({ members: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) });
}

/** POST /api/groups/[id]/join — 참여 신청 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const email = session.user.email;
  const userName = session.user.name ?? email.split("@")[0];

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // optional body
  }
  const message = body.message ? String(body.message).slice(0, 300) : null;

  // 모임 존재 및 정원 확인
  const group = await getMeeting(id);
  if (!group) {
    return NextResponse.json({ error: "모임을 찾을 수 없습니다." }, { status: 404 });
  }
  if (group.memberCount >= group.maxMembers) {
    return NextResponse.json({ error: "정원이 가득 찼습니다." }, { status: 409 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    const all = memStore.get(memKey(id)) ?? [];
    const exists = all.find((m) => m.userEmail === email);
    if (exists && exists.status !== "cancelled") {
      return NextResponse.json({ error: "이미 신청하셨습니다." }, { status: 409 });
    }
    const member: GroupMember = {
      id: `mem-${Date.now()}`,
      meetingId: id,
      userEmail: email,
      userName,
      message,
      status: "pending",
      joinedAt: new Date().toISOString(),
    };
    memStore.set(memKey(id), [member, ...all.filter((m) => m.userEmail !== email)]);
    return NextResponse.json({ member }, { status: 201 });
  }

  const { data, error } = await sb
    .from("group_members")
    .upsert(
      { meeting_id: id, user_email: email, user_name: userName, message, status: "pending" },
      { onConflict: "meeting_id,user_email", ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 신청하셨습니다." }, { status: 409 });
    }
    console.error("[groups/join] POST error:", error.message);
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 });
  }

  return NextResponse.json({ member: mapRow(data as Record<string, unknown>) }, { status: 201 });
}

/** PATCH /api/groups/[id]/join — 신청 상태 변경 (주최자: approve/reject, 본인: cancel) */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const targetEmail = String(body.userEmail ?? "").trim() || session.user.email;
  const newStatus = String(body.status ?? "").trim() as GroupMemberStatus;
  if (!["approved", "rejected", "cancelled"].includes(newStatus)) {
    return NextResponse.json({ error: "올바른 상태값이 아닙니다." }, { status: 400 });
  }

  const email = session.user.email;
  const group = await getMeeting(id);
  const isOrganizer = group?.organizerEmail === email;
  const isSelf = targetEmail === email;

  if (!isOrganizer && !isSelf) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  if (!isOrganizer && newStatus !== "cancelled") {
    return NextResponse.json({ error: "자신의 신청만 취소할 수 있습니다." }, { status: 403 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    const all = memStore.get(memKey(id)) ?? [];
    const idx = all.findIndex((m) => m.userEmail === targetEmail);
    if (idx === -1) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
    all[idx] = { ...all[idx], status: newStatus };
    memStore.set(memKey(id), all);
    return NextResponse.json({ member: all[idx] });
  }

  const { data, error } = await sb
    .from("group_members")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("meeting_id", id)
    .eq("user_email", targetEmail)
    .select()
    .single();

  if (error) {
    console.error("[groups/join] PATCH error:", error.message);
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 });
  }
  return NextResponse.json({ member: mapRow(data as Record<string, unknown>) });
}
