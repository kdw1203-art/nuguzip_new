/**
 * GET  /api/groups/[id]/members  — 모임 참여자 목록
 * POST /api/groups/[id]/members  — 모임 참여 (body: {action:"join"|"leave"})
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { joinMeetingMember, leaveMeeting, listMembers } from "@/lib/group-members/store-db";
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
    return NextResponse.json({ members, count: members.length });
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
