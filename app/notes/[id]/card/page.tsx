import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { getNote } from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { toCardSource } from "@/lib/notes/card-source";
import { availableFrames } from "@/lib/notes/card-frames";
import { autoBuildConfig, normalizeConfig } from "@/lib/notes/card-config";
import { NoteCardStudio, type AvailableFrame } from "./NoteCardStudio";

export const metadata: Metadata = {
  title: "나만의 임장 카드 | 내집나우",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * /notes/[id]/card — "나만의 카드" 스튜디오.
 *
 * 서버가 이 노트에서 채울 수 있는 프레임의 완성 콘텐츠를 만들어 넘긴다(build()는
 * 서버에서만 — 콘텐츠 로직 이원화 방지). 저장된 구성이 없으면 AI 자동 구성으로
 * 기본 카드를 만들어 보여 준다("임장노트를 쓰면 자동으로 카드가 만들어진다").
 * 소유자는 편집, 비소유자(공개 노트)는 캐러셀만.
 */
export default async function NoteCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const note = await getNote(id).catch(() => null);

  if (!note) {
    return (
      <PageShell breadcrumb="임장노트 · 카드">
        <div className="card mx-auto mt-8 max-w-[520px] rounded-2xl px-5 py-8 text-center">
          <p className="t-section text-ink">노트를 찾을 수 없어요</p>
          <Link href="/notes" className="btn-soft btn-sm mt-3 inline-block no-underline">
            공개 임장노트 보기
          </Link>
        </div>
      </PageShell>
    );
  }

  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  const isOwner = Boolean(email && note.authorEmail.toLowerCase() === email);

  // 비공개 노트는 소유자만 볼 수 있다
  if (!note.isPublic && !isOwner) {
    return (
      <PageShell breadcrumb="임장노트 · 카드">
        <div className="card mx-auto mt-8 max-w-[520px] rounded-2xl px-5 py-8 text-center">
          <p className="t-section text-ink">비공개 노트예요</p>
          <p className="mt-1 t-sub text-text-3">작성자만 이 카드를 볼 수 있어요.</p>
        </div>
      </PageShell>
    );
  }

  const source = toCardSource(note);
  const available: AvailableFrame[] = availableFrames(source).map((f) => ({
    id: f.id,
    label: f.label,
    category: f.category,
    content: f.build(source),
  }));

  // 저장된 구성 → 정규화, 없으면 자동 구성
  const saved = note.metadata?.cardConfig;
  const config = saved
    ? normalizeConfig(saved, source)
    : autoBuildConfig(source);

  const aptLabel = note.aptName || note.title || "임장 기록";

  return (
    <PageShell breadcrumb="임장노트 · 나만의 카드">
      <div className="mx-auto w-full max-w-[860px]">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="t-section text-ink">나만의 임장 카드</h1>
            <p className="t-sub text-text-3">
              {aptLabel}
              {note.region ? ` · ${note.region}` : ""}
            </p>
          </div>
          <Link href={`/notes/${id}`} className="btn-soft btn-sm no-underline">
            ← 노트로 돌아가기
          </Link>
        </div>

        <div className="card rounded-[20px] p-5 md:p-6">
          <NoteCardStudio
            noteId={id}
            available={available}
            initialThemeId={config.themeId}
            initialFrameIds={config.frameIds}
            editable={isOwner}
          />
        </div>

        {!saved && isOwner && (
          <p className="mt-3 text-center t-sub text-text-3">
            AI가 기록을 바탕으로 카드를 자동으로 구성했어요. 색상·장을 바꾼 뒤 저장하면
            나만의 카드가 완성돼요.
          </p>
        )}
      </div>
    </PageShell>
  );
}
