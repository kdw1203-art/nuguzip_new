import { getServiceSupabase } from "@/lib/supabase/service";

export type GroupMember = {
  id: string;
  meetingId: string;
  userEmail: string;
  userLabel: string | null;
  status: "joined" | "left" | "kicked";
  joinedAt: string;
  leftAt: string | null;
};

function mapRow(r: Record<string, unknown>): GroupMember {
  return {
    id: String(r.id ?? ""),
    meetingId: String(r.meeting_id ?? ""),
    userEmail: String(r.user_email ?? ""),
    userLabel: r.user_label ? String(r.user_label) : null,
    status: (r.status as GroupMember["status"]) ?? "joined",
    joinedAt: String(r.joined_at ?? ""),
    leftAt: r.left_at ? String(r.left_at) : null,
  };
}

/** 원본(영문) DB 오류를 한국어 사용자 메시지로 변환 (원본은 서버 로그로) */
function friendlyDbError(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  console.error("[group-members] db error:", msg);
  if (/schema cache|could not find the .* column|column .* does not exist/i.test(msg)) {
    return "참여 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export async function listMembers(meetingId: string): Promise<GroupMember[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("group_members")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("status", "joined")
    .order("joined_at", { ascending: true });
  return (data ?? []).map(mapRow);
}

export async function getMembership(
  meetingId: string,
  userEmail: string,
): Promise<GroupMember | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("group_members")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("user_email", userEmail)
    .maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function joinMeetingMember(
  meetingId: string,
  userEmail: string,
  userLabel?: string,
): Promise<{ ok: boolean; message?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "Supabase 미설정" };

  // 이미 참여 중인지 확인
  const existing = await getMembership(meetingId, userEmail);
  if (existing && existing.status === "joined") {
    return { ok: false, message: "이미 참여 중인 모임입니다." };
  }

  const { error } = await sb.from("group_members").upsert(
    {
      meeting_id: meetingId,
      user_email: userEmail,
      user_label: userLabel ?? null,
      status: "joined",
      joined_at: new Date().toISOString(),
      left_at: null,
    },
    { onConflict: "meeting_id,user_email" },
  );
  if (error) return { ok: false, message: friendlyDbError(error) };

  // meetings.current_members 증가
  try {
    await sb.rpc("increment_meeting_members", { p_meeting_id: meetingId });
  } catch {
    const { data: m } = await sb.from("meetings").select("current_members").eq("id", meetingId).maybeSingle();
    if (m) {
      await sb.from("meetings").update({ current_members: (m.current_members as number) + 1 }).eq("id", meetingId);
    }
  }

  return { ok: true };
}

export async function leaveMeeting(
  meetingId: string,
  userEmail: string,
): Promise<{ ok: boolean; message?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "Supabase 미설정" };

  const { error } = await sb
    .from("group_members")
    .update({ status: "left", left_at: new Date().toISOString() })
    .eq("meeting_id", meetingId)
    .eq("user_email", userEmail);

  if (error) return { ok: false, message: friendlyDbError(error) };

  // meetings.current_members 감소
  const { data: meeting } = await sb
    .from("meetings")
    .select("current_members")
    .eq("id", meetingId)
    .maybeSingle();
  if (meeting && (meeting.current_members as number) > 0) {
    await sb
      .from("meetings")
      .update({ current_members: (meeting.current_members as number) - 1 })
      .eq("id", meetingId);
  }

  return { ok: true };
}

export async function listMyMeetings(userEmail: string): Promise<GroupMember[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("group_members")
    .select("*")
    .eq("user_email", userEmail)
    .eq("status", "joined")
    .order("joined_at", { ascending: false });
  return (data ?? []).map(mapRow);
}
