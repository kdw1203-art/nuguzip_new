import { notFound } from "next/navigation";
import { getNote } from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { NoteForm, type NoteFormInitialNote } from "../../new/NoteForm";

/* 임장노트 수정 — 작성 폼(NoteForm) 재사용. 소유자만 접근, 저장은 PATCH.
   비소유자에게는 존재 여부를 숨기기 위해 404 로 응답한다. */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "임장노트 수정 — 누구집",
  robots: { index: false, follow: false },
};

export default async function NoteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();

  let note = null;
  try {
    note = await getNote(id);
  } catch {
    note = null;
  }
  if (!note) notFound();
  if (!email || note.authorEmail.toLowerCase() !== email) notFound();

  const initial: NoteFormInitialNote = {
    id: note.id,
    title: note.title,
    region: note.region,
    aptName: note.aptName ?? null,
    visitDate: note.visitDate,
    summary: note.summary ?? null,
    scores: note.scores,
    checklist: note.checklist,
    sections: {
      pros: note.sections.pros,
      cons: note.sections.cons,
      memo: note.sections.memo,
    },
    photos: note.photos,
    isPublic: note.isPublic,
    metadata: (note.metadata ?? null) as Record<string, unknown> | null,
  };

  return <NoteForm initialNote={initial} />;
}
