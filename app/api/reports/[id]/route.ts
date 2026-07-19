import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteReport, getReport, updateReport } from "@/lib/reports/store-db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "없음" }, { status: 404 });
  return NextResponse.json({ report });
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
  const email = session.user.email;
  const isAdmin = session.user.role === "admin";

  // 소유 여부 확인
  const existing = await getReport(id);
  if (!existing) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (!isAdmin && existing.authorId && existing.authorId !== email) {
    return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const updated = await updateReport(id, body, isAdmin ? undefined : email);
  if (!updated) return NextResponse.json({ error: "수정 실패" }, { status: 404 });
  return NextResponse.json({ report: updated });
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
  const email = session.user.email;
  const isAdmin = session.user.role === "admin";

  // 소유 여부 확인
  const existing = await getReport(id);
  if (!existing) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (!isAdmin && existing.authorId && existing.authorId !== email) {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }

  await deleteReport(id, isAdmin ? undefined : email);
  return NextResponse.json({ ok: true });
}
