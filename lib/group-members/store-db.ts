/**
 * 모임 참여자 저장소.
 *
 * 이 파일의 조회 함수들은 **실패하면 던진다.** 예전에는 `const { data } = ...`
 * 로 error 를 아예 받지 않아서, DB 가 밀리는 순간 참여자 목록이 빈 배열로,
 * 참여 여부가 "참여 안 함"으로 돌아왔다. 그게 그대로 화면에 "참여자 0명"으로
 * 찍히고, 참여 여부 오판은 아래 joinMeetingMember 에서 이미 참여 중인 사람의
 * 인원수를 한 번 더 올리는 데까지 이어졌다 — 조회 실패가 "없음"이라는 사실로
 * 둔갑하고, 그 잘못된 사실이 DB 에 남는 경로였다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

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
  logger.error("[group-members] db error:", msg);
  if (/schema cache|could not find the .* column|column .* does not exist/i.test(msg)) {
    return "참여 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export async function listMembers(meetingId: string): Promise<GroupMember[]> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("group_members 조회 실패: Supabase 미설정");
  const { data, error } = await sb
    .from("group_members")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("status", "joined")
    .order("joined_at", { ascending: true });
  if (error) throw new Error(`group_members 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("group_members 조회 실패: 응답이 배열이 아닙니다");
  return data.map(mapRow);
}

export async function getMembership(
  meetingId: string,
  userEmail: string,
): Promise<GroupMember | null> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("group_members 조회 실패: Supabase 미설정");
  const { data, error } = await sb
    .from("group_members")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("user_email", userEmail)
    .maybeSingle();
  /* 행이 없으면 maybeSingle 은 error 없이 data=null 을 준다. 그 null 만
     "참여 안 함"이다 — 조회가 실패해서 생긴 null 과 섞으면 안 된다. */
  if (error) throw new Error(`group_members 조회 실패: ${error.message}`);
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

  /* meetings.current_members 증가.
     참여 자체는 위에서 이미 저장됐으므로 여기서 실패해도 되돌리지 않는다.
     다만 **조용히 넘기지는 않는다** — 예전 코드는 rpc 를 try/catch 로 감쌌는데,
     Supabase 쿼리 빌더는 예외를 던지지 않고 { error } 를 돌려주므로 그 catch 는
     한 번도 실행된 적이 없다. 인원수가 어긋난 채로 아무 기록도 남지 않았다. */
  const { error: rpcError } = await sb.rpc("increment_meeting_members", {
    p_meeting_id: meetingId,
  });
  if (rpcError) {
    logger.error("[group-members] increment_meeting_members 실패:", rpcError.message);
    const { data: m, error: readError } = await sb
      .from("meetings")
      .select("current_members")
      .eq("id", meetingId)
      .maybeSingle();
    if (readError) {
      logger.error("[group-members] current_members 조회 실패:", readError.message);
    } else if (m) {
      const { error: bumpError } = await sb
        .from("meetings")
        .update({ current_members: (m.current_members as number) + 1 })
        .eq("id", meetingId);
      if (bumpError) {
        logger.error("[group-members] current_members 증가 실패:", bumpError.message);
      }
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

  /* meetings.current_members 감소 — 위 증가 쪽과 같은 이유로 실패를 기록한다.
     탈퇴 자체는 이미 반영됐으므로 여기서 실패해도 되돌리지 않는다. */
  const { data: meeting, error: readError } = await sb
    .from("meetings")
    .select("current_members")
    .eq("id", meetingId)
    .maybeSingle();
  if (readError) {
    logger.error("[group-members] current_members 조회 실패:", readError.message);
  } else if (meeting && (meeting.current_members as number) > 0) {
    const { error: dropError } = await sb
      .from("meetings")
      .update({ current_members: (meeting.current_members as number) - 1 })
      .eq("id", meetingId);
    if (dropError) {
      logger.error("[group-members] current_members 감소 실패:", dropError.message);
    }
  }

  return { ok: true };
}

export async function listMyMeetings(userEmail: string): Promise<GroupMember[]> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("group_members 조회 실패: Supabase 미설정");
  const { data, error } = await sb
    .from("group_members")
    .select("*")
    .eq("user_email", userEmail)
    .eq("status", "joined")
    .order("joined_at", { ascending: false });
  if (error) throw new Error(`group_members 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("group_members 조회 실패: 응답이 배열이 아닙니다");
  return data.map(mapRow);
}
