import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { appendOnboardingStep } from "@/lib/onboarding/append-step";
import { deleteNote, getNote, updateNote } from "@/lib/inspection/store-db";
import { awardPoints } from "@/lib/points/ledger";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/* getNote/updateNote 는 조회에 실패하면 던진다(예전엔 null 을 돌려줬다).
   null 을 그대로 받아 404 "없음"을 내보내면, 저장돼 있는 노트를 지워졌다고
   답하는 셈이다. 실패는 503 + Retry-After 로만 말한다. */
async function loadNote(id: string) {
  try {
    return { ok: true as const, note: await getNote(id) };
  } catch (e) {
    return { ok: false as const, res: dbUnavailable("inspection-note", e) };
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const { id } = await params;
  const loaded = await loadNote(id);
  if (!loaded.ok) return loaded.res;
  const note = loaded.note;
  if (!note) return NextResponse.json({ error: "없음" }, { status: 404 });
  const email = session?.user?.email?.trim().toLowerCase();
  const isOwner = Boolean(email && note.authorEmail.toLowerCase() === email);
  if (!note.isPublic && !isOwner) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  if (isOwner) return NextResponse.json({ note });
  // 개인정보 보호: 타인 공개 노트 응답에서 작성자 이메일 제거
  const { authorEmail: _authorEmail, ...rest } = note;
  return NextResponse.json({
    note: {
      ...rest,
      authorLabel:
        rest.authorLabel?.trim() ||
        `${_authorEmail.split("@")[0]?.slice(0, 2) || "이웃"}** 이웃`,
    },
  });
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
  const loaded = await loadNote(id);
  if (!loaded.ok) return loaded.res;
  const exists = loaded.note;
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
  let updated: Awaited<ReturnType<typeof updateNote>>;
  try {
    updated = await updateNote(id, body);
  } catch (e) {
    return dbUnavailable("inspection-note-update", e);
  }
  if (!updated) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (updated.isPublic) {
    void appendOnboardingStep(session.user.email, "share");
    // 비공개 → 공개 전환 시에만 적립. refId=noteId 로 재공개 중복 지급 방지.
    if (!exists.isPublic) {
      await awardPoints(session.user.email, "note_public", id);
    }
  }
  // 공개 여부가 바뀌면 공개 피드를 즉시 갱신(ISR 대기 없이 바로 반영)
  if (exists.isPublic !== updated.isPublic) {
    revalidatePath("/notes");
    revalidatePath("/");
    revalidatePath(`/notes/${id}`);
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
  const loaded = await loadNote(id);
  if (!loaded.ok) return loaded.res;
  const exists = loaded.note;
  if (!exists) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (exists.authorEmail.toLowerCase() !== session.user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  await deleteNote(id);
  return NextResponse.json({ ok: true });
}
