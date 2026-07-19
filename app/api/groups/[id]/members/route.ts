/**
 * GET  /api/groups/[id]/members  — 모임 참여자 목록
 * POST /api/groups/[id]/members  — 모임 참여 (body: {action:"join"|"leave"})
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { joinMeetingMember, leaveMeeting, listMembers } from "@/lib/group-members/store-db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const members = await listMembers(id);
  return NextResponse.json({ members, count: members.length });
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
    const result = await leaveMeeting(id, session.user.email);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const result = await joinMeetingMember(
    id,
    session.user.email,
    session.user.name ?? undefined,
  );
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
