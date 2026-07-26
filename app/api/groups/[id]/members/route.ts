/**
 * GET  /api/groups/[id]/members  — 모임 참여자 목록
 * POST /api/groups/[id]/members  — 모임 참여 (body: {action:"join"|"leave"})
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { joinMeetingMember, leaveMeeting, listMembers } from "@/lib/group-members/store-db";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * 저장소가 던진 조회 실패를 그대로 "일시적으로 못 준다"로 옮긴다.
 *
 * 400 이 아니라 503 인 이유: 400 은 "요청이 잘못됐다"는 뜻이라 클라이언트가
 * 재시도하지 않는다. 여기서 실패하는 건 요청이 아니라 DB 쪽이고, 잠시 뒤
 * 같은 요청이 성공한다. 빈 배열(= 참여자 0명)로 답하는 선택지는 없다.
 */
function dbUnavailable(where: string, err: unknown) {
  logger.error(`[api/groups/members] ${where}`, err);
  return NextResponse.json(
    { error: "지금은 모임 참여 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요." },
    { status: 503, headers: { "Retry-After": "30" } },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const members = await listMembers(id);
    return NextResponse.json({ members, count: members.length });
  } catch (err) {
    return dbUnavailable(`참여자 목록 조회 실패 (meeting=${id})`, err);
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
      return dbUnavailable(`탈퇴 처리 실패 (meeting=${id})`, err);
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
    return dbUnavailable(`참여 처리 실패 (meeting=${id})`, err);
  }
}
