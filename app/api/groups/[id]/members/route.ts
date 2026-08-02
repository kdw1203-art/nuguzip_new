/**
 * GET  /api/groups/[id]/members  — 모임 참여자 목록
 * POST /api/groups/[id]/members  — 모임 참여 (body: {action:"join"|"leave"})
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { joinMeetingMember, leaveMeeting, listMembers } from "@/lib/group-members/store-db";
import { chatAliasId, chatAliasLabel } from "@/lib/chat/pseudonym";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";

/** 빈 배열(= 참여자 0명)로 답하는 선택지는 없다 — dbUnavailable 주석 참고. */
const MEMBERS_UNAVAILABLE = "지금은 모임 참여 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const members = await listMembers(id);
    /* 비인증 GET 이다 — 원본 GroupMember(userEmail 포함)를 그대로 내보내면
       누구나 모임 하나의 참여자 이메일 전체를 긁을 수 있다. 가명 ID + 표시명만
       내보낸다(채팅 스레드 API 와 같은 규칙, lib/chat/pseudonym.ts 참고). */
    const sanitized = members.map((m) => {
      const aliasId = chatAliasId(m.userEmail);
      return {
        id: aliasId,
        label: m.userLabel?.trim() || chatAliasLabel(aliasId),
        joinedAt: m.joinedAt,
      };
    });
    return NextResponse.json({ members: sanitized, count: sanitized.length });
  } catch (err) {
    return dbUnavailable(`참여자 목록 조회 실패 (meeting=${id})`, err, MEMBERS_UNAVAILABLE);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = String(body.action ?? "join");

  if (action === "leave") {
    try {
      const result = await leaveMeeting(id, session.user.email);
      if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return dbUnavailable(`탈퇴 처리 실패 (meeting=${id})`, err, MEMBERS_UNAVAILABLE);
    }
  }

  try {
    const result = await joinMeetingMember(
      id,
      session.user.email,
      session.user.name ?? undefined,
    );
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    /* 참여 여부 확인이 실패한 상태에서 그냥 넣으면, 이미 참여 중인 사람의
       인원수를 한 번 더 올린다. 넣지 않고 "지금은 못 한다"고 답한다. */
    return dbUnavailable(`참여 처리 실패 (meeting=${id})`, err, MEMBERS_UNAVAILABLE);
  }
}
