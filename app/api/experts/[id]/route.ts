import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageExpertProfile, sanitizeExpertForPublic } from "@/lib/experts/access";
import { deleteExpert, getExpert, updateExpert } from "@/lib/experts/store-db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const expert = await getExpert(id);
  if (!expert) return NextResponse.json({ error: "없음" }, { status: 404 });
  return NextResponse.json({ expert: sanitizeExpertForPublic(expert) });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const prev = await getExpert(id);
  if (!prev) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (!(await canManageExpertProfile(session, prev))) {
    return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const updated = await updateExpert(id, body);
  if (!updated) return NextResponse.json({ error: "없음" }, { status: 404 });
  return NextResponse.json({ expert: sanitizeExpertForPublic(updated) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const prev = await getExpert(id);
  if (!prev) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (!(await canManageExpertProfile(session, prev))) {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }
  await deleteExpert(id);
  return NextResponse.json({ ok: true });
}
