import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appendOnboardingStep } from "@/lib/onboarding/append-step";
import { deleteNote, getNote, updateNote } from "@/lib/inspection/store-db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await params;
  const note = await getNote(id);
  if (!note) return NextResponse.json({ error: "없음" }, { status: 404 });
  const email = session?.user?.email?.trim().toLowerCase();
  const isOwner = Boolean(email && note.authorEmail.toLowerCase() === email);
  if (!note.isPublic && !isOwner) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  return NextResponse.json({ note });
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
  const exists = await getNote(id);
  if (!exists) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (exists.authorEmail.toLowerCase() !== session.user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (body.metadata && typeof body.metadata === "object") {
    body.metadata = {
      ...(exists.metadata ?? {}),
      ...(body.metadata as Record<string, unknown>),
    };
  }
  const updated = await updateNote(id, body);
  if (!updated) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (updated.isPublic) {
    void appendOnboardingStep(session.user.email, "share");
  }
  return NextResponse.json({ note: updated });
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
  const exists = await getNote(id);
  if (!exists) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (exists.authorEmail.toLowerCase() !== session.user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  await deleteNote(id);
  return NextResponse.json({ ok: true });
}
