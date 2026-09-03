import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import {
  listBestNoteMonths,
  formatYmKo,
  SCORE_AXES,
  MAX_SCORE,
  MIN_SCORE,
  MIN_NOTES_PER_MONTH,
  MAX_NOTES_PER_MONTH,
  MAX_PER_AUTHOR,
  type BestNotesMonth,
} from "@/lib/inspection/best-notes";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import {
  LOAD_FAILED_LINE,
  loadWithinPrerenderBudget,
} from "@/lib/data/prerender-budget";
import { cache } from "react";

/* ============================================================
   N13 — 이달의 공개 임장노트 (목록 + 선정 기준 공개).

   사람이 고르지 않는다. 다섯 축을 상한을 둔 점수로 재서 합산하고,
   그 계산식을 이 페이지에 그대로 적는다. 점수가 재는 것은 "기록이 얼마나
   자세한가" 이지 "그 단지가 좋은가" 가 아니다 — 노트 안의 항목 점수가
   높다고 가산점을 주면 후하게 쓸 유인이 생기므로 그건 보지 않는다.

   조회 실패와 "아직 뽑힌 달이 없다" 를 화면에서 구분한다.

   ── 조회에 상한을 두는 이유 (배포 #263) ────────────────────────
   이 라우트는 revalidate 만 있고 동적 파라미터가 없어 `next build` 가 빌드
   타임에 프리렌더한다. 그런데 Next 는 페이지 하나당 정적 생성 60초 상한을 두고,
   넘기면 **빌드를 실패시킨다**. 배포 #263 이 실제로 그렇게 죽었다 — DB 가 밀린
   몇 분 동안 이 페이지가 60초를 다 태워 릴리스가 통째로 나가지 못했다.
   느린 DB 는 페이지 내용을 떨어뜨릴 수는 있어도 배포를 막아서는 안 된다.
   그래서 조회를 20초에 접고, 못 읽었으면 못 읽었다고 적은 채로 페이지를 낸다.
   ============================================================ */

export const revalidate = 1800;

/** loadFailed: 조회가 실패했거나 상한 안에 끝나지 않았다. "노트가 없다"와 다른 사건이다. */
type IndexData = { months: BestNotesMonth[]; loadFailed: boolean };

const load = cache(async (): Promise<IndexData> => {
  const run = await loadWithinPrerenderBudget("[/notes/best] 공개 임장노트", () =>
    listBestNoteMonths(),
  );
  /* 실패를 `months: []` 로만 흘려보내면 아래 빈 상태 문구("아직 기준을 채운 달이
     없습니다")가 뜬다 — 못 읽은 것을 없다고 단정하는 셈이라 반드시 갈라 놓는다. */
  return run.ok
    ? { months: run.data, loadFailed: false }
    : { months: [], loadFailed: true };
});

export async function generateMetadata(): Promise<Metadata> {
  const { loadFailed } = await load();
  const base = buildPageMetadata({
    title: "이달의 공개 임장노트",
    description:
      "직접 다녀와 기록한 공개 임장노트 중 기록이 충실한 노트를 매달 정리합니다. 사람이 고르지 않고 공개된 계산식으로 뽑습니다.",
    path: "/notes/best",
  });
  return loadFailed ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function BestNotesIndexPage() {
  const { months, loadFailed } = await load();

  return (
    <PageShell breadcrumb="이달의 공개 임장노트">
      <div className="mx-auto max-w-[760px]">
        <h1 className="rise-in t-title text-ink">이달의 공개 임장노트</h1>
        <p className="rise-in-1 mt-2 t-body text-text-2">
          공개에 동의한 임장노트 중 <strong className="text-ink">기록이 충실한 노트</strong>를
          매달 정리합니다. 운영자가 마음에 드는 노트를 고르는 방식이 아니라, 아래 계산식으로
          점수를 매겨 상위를 싣습니다.
        </p>

        {/* 선정 기준 — 문서 N13 의 "선정 기준 공개" */}
        <section className="rise-in-2 card mt-6 p-[var(--pad-card)]">
          <h2 className="t-section text-ink">선정 기준 (총 {MAX_SCORE}점)</h2>
          <div className="mt-3 flex flex-col gap-3">
            {SCORE_AXES.map((a) => (
              <div key={a.key} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                <p className="t-body font-extrabold text-ink">
                  {a.label} <span className="text-primary">{a.max}점</span>
                </p>
                <p className="mt-0.5 t-sub text-text-3">{a.how}</p>
              </div>
            ))}
          </div>
          <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 t-sub text-text-3">
            <li>
              {MIN_SCORE}점 미만은 후보로 세지 않고, 자격 노트가 {MIN_NOTES_PER_MONTH}편 미만인
              달은 아예 만들지 않습니다. 두 편짜리 선정은 선정이 아니기 때문입니다.
            </li>
            <li>
              한 달에 최대 {MAX_NOTES_PER_MONTH}편, 같은 작성자는 최대 {MAX_PER_AUTHOR}편까지만
              싣습니다.
            </li>
            <li>
              이 점수는 <strong className="text-ink">기록의 충실도</strong>만 잽니다. 그 단지가
              좋은 단지인지, 값이 적절한지와는 무관합니다. 노트에 적힌 입지·학군 점수가 높다고
              가산점을 주지 않습니다 — 그러면 후하게 쓸수록 뽑히게 되기 때문입니다.
            </li>
          </ul>
        </section>

        {loadFailed ? (
          <div className="mt-6 card rounded-2xl px-5 py-8 text-center t-body text-text-3">
            <strong className="text-ink">{LOAD_FAILED_LINE}</strong>
            <br />
            공개 임장노트가 없다는 뜻이 아니라, 조회가 제때 끝나지 않았거나 실패했다는
            뜻입니다.
          </div>
        ) : months.length > 0 ? (
          <div className="mt-6 flex flex-col gap-3">
            {months.map((m) => (
              <Link
                key={m.ym}
                href={`/notes/best/${m.ym}`}
                className="card tile flex items-center justify-between rounded-2xl px-5 py-4 no-underline"
              >
                <span className="t-section text-ink">
                  {formatYmKo(m.ym)} 이달의 임장노트
                </span>
                <span className="t-sub font-semibold text-text-3">
                  {m.picks.length}편 수록 · 후보 {m.qualifiedCount}편 ›
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-6 card rounded-2xl px-5 py-8 text-center t-body text-text-3">
            아직 기준을 채운 달이 없습니다. 한 달에 {MIN_SCORE}점 이상 노트가{" "}
            {MIN_NOTES_PER_MONTH}편 모이면 자동으로 만들어집니다.
            <br />
            <Link href="/notes/new" className="mt-2 inline-block font-bold text-primary underline">
              임장노트 쓰기
            </Link>
          </div>
        )}

        {/* [#124] 이달의 현장 인증 리더보드 — 위치 확인(#71) 통과 노트의 월간 랭킹 */}
        <FieldVerifiedLeaderboard />

        <p className="mb-8 mt-5 t-sub text-text-3">
          <Link href="/notes" className="font-bold text-primary underline">
            공개 임장노트 전체 보기
          </Link>
        </p>
      </div>
    </PageShell>
  );
}

/* [#124] 월간 현장 인증 랭킹 — metadata.visitVerified 가 있는 공개 노트를
   작성자 표시명 기준으로 집계. 0명이면 섹션을 그리지 않는다(빈 리더보드 금지). */
async function FieldVerifiedLeaderboard() {
  const { getServiceSupabase } = await import("@/lib/supabase/service");
  const { maskNoteAuthor } = await import("@/app/town/shared");
  const sb = getServiceSupabase();
  if (!sb) return null;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  let rows: Array<{ label: string; count: number }> = [];
  try {
    const { data, error } = await sb
      .from("inspection_notes")
      .select("author_label, author_email")
      .eq("is_public", true)
      .not("metadata->visitVerified", "is", null)
      .gte("created_at", monthStart.toISOString())
      .limit(500);
    if (error || !data) return null;
    const freq = new Map<string, number>();
    for (const r of data as Array<{ author_label: string | null; author_email: string | null }>) {
      const label = maskNoteAuthor(r.author_label, r.author_email ?? "");
      freq.set(label, (freq.get(label) ?? 0) + 1);
    }
    rows = [...freq.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  } catch {
    return null;
  }
  if (rows.length === 0) return null;
  const medals = ["🥇", "🥈", "🥉", "4", "5"];
  return (
    <section className="mt-8">
      <h2 className="t-section text-ink">
        이달의 현장 인증{" "}
        <span className="t-sub font-medium text-text-3">
          단지 반경 2km 위치 확인을 통과한 기록
        </span>
      </h2>
      <div className="card mt-2 rounded-2xl px-4 py-2">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className="flex items-center justify-between border-b border-divider py-2.5 t-body last:border-0"
          >
            <span className="font-bold text-ink">
              <span className="mr-2">{medals[i]}</span>
              {r.label}
            </span>
            <span className="font-extrabold text-primary tabular-nums">{r.count}편</span>
          </div>
        ))}
      </div>
      <p className="t-caption mt-1.5 text-text-3">
        매월 1일 리셋 · 인증은 작성 시 선택이며 위치 좌표는 저장되지 않습니다.
      </p>
    </section>
  );
}
