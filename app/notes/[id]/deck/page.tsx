import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { getNote, type InspectionNote } from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { loadMeProfile } from "@/lib/me/profile";
import { buildNoteDeck, normalizeDeckPlan, DECK_PLAN_RANGE } from "@/lib/inspection/note-deck";
import { DeckViewer } from "./DeckViewer";

/* 임장노트 카드 덱 — "쓴 노트를 AI 가 분석하고 디자인해서" 보여 주는 화면.
   여기서 새로 만드는 것은 **레이아웃**이지 문장이 아니다. 카드에 들어가는 글은
   전부 노트 원문과 이미 저장된 AI 분석(inspection_notes.ai_analysis)에서 온다.
   렌더 시점에 LLM 을 호출하지 않는다 — 볼 때마다 내용이 달라지면 그건 내 노트가
   아니고, 조회당 비용도 붙는다.

   색인 정책: 이 화면은 /notes/[id] 와 같은 내용을 다른 형태로 보여 주는 중복
   화면이다. 사이트맵에 넣지 않고 noindex 로 둔다(크롤 예산·함수 호출 보호).

   비공개 노트도 열린다 — 오너 요청("공개노트든 비공개노트든"). 다만 열람 권한은
   상세 페이지와 **똑같은 관문**을 쓴다. 비공개 노트는 작성자 본인만. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "임장노트 카드 — 내집나우",
  robots: { index: false, follow: false },
};

type LoadResult =
  | { kind: "ok"; note: InspectionNote }
  | { kind: "missing" }
  | { kind: "error"; message: string };

async function loadNote(id: string): Promise<LoadResult> {
  try {
    const note = await getNote(id);
    return note ? { kind: "ok", note } : { kind: "missing" };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** 장수를 정하는 것은 **보는 사람이 아니라 쓴 사람**의 플랜이다.
    조회에 실패하면 플랜을 올려 잡지 않고 free 로 둔다(없는 혜택을 주지 않는다). */
async function authorPlan(email: string): Promise<string> {
  try {
    const profile = await loadMeProfile(email);
    return profile.plan;
  } catch {
    return "free";
  }
}

export default async function NoteDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await safeAuth();
  const viewerEmail = session?.user?.email?.trim().toLowerCase() ?? null;

  const loaded = await loadNote(id);

  /* 조회 실패를 "노트 없음"으로 바꾸지 않는다 — 그건 사실이 아니다. */
  if (loaded.kind === "error") {
    return (
      <PageShell breadcrumb="임장노트 › 카드">
        <ErrorState
          title="카드를 만들지 못했어요"
          desc="노트를 불러오는 데 실패했어요. 잠시 뒤 새로고침하면 대부분 정상으로 돌아옵니다."
          cause={loaded.message}
          action={{ label: "임장노트 목록", href: "/notes" }}
        />
      </PageShell>
    );
  }

  if (loaded.kind === "missing") notFound();
  const note = loaded.note;
  const isOwner = Boolean(viewerEmail && note.authorEmail.toLowerCase() === viewerEmail);
  if (!note.isPublic && !isOwner) notFound();

  const plan = normalizeDeckPlan(await authorPlan(note.authorEmail));
  const deck = buildNoteDeck({ note, plan });

  const upgradeRange =
    plan === "free" ? DECK_PLAN_RANGE.pro : plan === "pro" ? DECK_PLAN_RANGE.expert : null;

  return (
    <PageShell breadcrumb="임장노트 › 카드" wide>
      <div className="rise-in mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate t-title text-ink">
            {note.title}
          </h1>
          <p className="mt-1 t-body text-text-3">
            {[note.region, note.aptName].filter(Boolean).join(" · ")} · {deck.pages.length}장 ·{" "}
            {deck.planLabel} {deck.range.label}
            {!note.isPublic && " · 비공개 노트"}
          </p>
        </div>
        <Link
          href={`/notes/${id}`}
          className="press shrink-0 rounded-xl border border-border bg-surface px-3.5 py-2 t-body font-bold text-text-1"
        >
          원문 보기
        </Link>
      </div>

      <DeckViewer deck={deck} />

      {/* 무엇으로 만들어졌는지 — 카드가 예쁘게 나올수록 출처를 분명히 적는다. */}
      <p className="mt-4 t-sub text-text-3">
        카드의 글은 이 노트에 직접 쓰신 내용과{" "}
        {deck.hasAiReport ? "저장된 AI 분석" : "노트 원문"}에서 그대로 옮긴 것입니다. 카드로 만들
        때 없는 내용을 지어내지 않습니다.
      </p>

      {/* 내용이 모자라 플랜 최소 장수에 못 미친 경우 — 채워 넣는 대신 사실대로 말한다. */}
      {deck.shortOf > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <p className="t-body font-extrabold text-ink">
            지금 노트로 만들 수 있는 카드는 {deck.pages.length}장이에요
          </p>
          <p className="mt-1.5 t-body text-text-2">
            {deck.planLabel} 플랜은 {deck.range.label}까지 만들 수 있지만, 없는 내용을 지어내
            장수를 채우지는 않습니다. 아래를 채우면 카드가 늘어납니다.
          </p>
          {deck.growthHints.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {deck.growthHints.map((h) => (
                <li
                  key={h}
                  className="rounded-full bg-primary-soft px-2.5 py-1 t-sub font-bold text-primary"
                >
                  {h}
                </li>
              ))}
            </ul>
          )}
          {isOwner && (
            <Link
              href={`/notes/${id}/edit`}
              className="press mt-3 inline-flex rounded-xl bg-primary px-3.5 py-2 t-body font-bold text-white"
            >
              노트 이어서 쓰기
            </Link>
          )}
        </div>
      )}

      {/* 상한 때문에 잘린 분량이 실제로 있을 때만 상위 플랜을 안내한다. */}
      {deck.trimmed > 0 && upgradeRange && (
        <div className="mt-4 rounded-2xl border border-border bg-primary-soft p-4">
          <p className="t-body font-extrabold text-ink">
            이 노트에는 {deck.trimmed}장이 더 있어요
          </p>
          <p className="mt-1.5 t-body text-text-2">
            지금 {deck.planLabel} 플랜은 {deck.range.label}까지 보여 드립니다. 이 노트로 만들 수
            있는 카드는 모두 {deck.available}장이에요.
          </p>
          <Link
            href="/subscription"
            className="press mt-3 inline-flex rounded-xl bg-primary px-3.5 py-2 t-body font-bold text-white"
          >
            {upgradeRange.label} 플랜 보기
          </Link>
        </div>
      )}
    </PageShell>
  );
}
