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
import { logger } from "@/lib/log";
import { cache } from "react";

/* ============================================================
   N13 — 이달의 공개 임장노트 (목록 + 선정 기준 공개).

   사람이 고르지 않는다. 다섯 축을 상한을 둔 점수로 재서 합산하고,
   그 계산식을 이 페이지에 그대로 적는다. 점수가 재는 것은 "기록이 얼마나
   자세한가" 이지 "그 단지가 좋은가" 가 아니다 — 노트 안의 항목 점수가
   높다고 가산점을 주면 후하게 쓸 유인이 생기므로 그건 보지 않는다.

   조회 실패와 "아직 뽑힌 달이 없다" 를 화면에서 구분한다.
   ============================================================ */

export const revalidate = 1800;

type IndexData = { months: BestNotesMonth[]; loadError: string | null };

const load = cache(async (): Promise<IndexData> => {
  try {
    return { months: await listBestNoteMonths(), loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      "[/notes/best] 공개 임장노트를 읽지 못했습니다 — 노트가 없는 것이 아니라 조회가 실패했습니다:",
      message,
    );
    return { months: [], loadError: message };
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const { loadError } = await load();
  const base = buildPageMetadata({
    title: "이달의 공개 임장노트",
    description:
      "직접 다녀와 기록한 공개 임장노트 중 기록이 충실한 노트를 매달 정리합니다. 사람이 고르지 않고 공개된 계산식으로 뽑습니다.",
    path: "/notes/best",
  });
  return loadError ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function BestNotesIndexPage() {
  const { months, loadError } = await load();

  return (
    <PageShell breadcrumb="이달의 공개 임장노트">
      <div className="mx-auto max-w-[760px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">이달의 공개 임장노트</h1>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-2">
          공개에 동의한 임장노트 중 <strong className="text-ink">기록이 충실한 노트</strong>를
          매달 정리합니다. 운영자가 마음에 드는 노트를 고르는 방식이 아니라, 아래 계산식으로
          점수를 매겨 상위를 싣습니다.
        </p>

        {/* 선정 기준 — 문서 N13 의 "선정 기준 공개" */}
        <section className="rise-in-2 card mt-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">선정 기준 (총 {MAX_SCORE}점)</h2>
          <div className="mt-3 flex flex-col gap-3">
            {SCORE_AXES.map((a) => (
              <div key={a.key} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                <p className="text-[13px] font-extrabold text-ink">
                  {a.label} <span className="text-primary">{a.max}점</span>
                </p>
                <p className="mt-0.5 text-[12px] leading-[1.6] text-text-3">{a.how}</p>
              </div>
            ))}
          </div>
          <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-[12px] leading-[1.6] text-text-3">
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

        {loadError ? (
          <div className="mt-6 card rounded-[16px] px-5 py-8 text-center text-[13px] leading-[1.7] text-text-3">
            공개 임장노트를 <strong className="text-ink">불러오지 못했습니다</strong>.
            <br />
            노트가 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻입니다. 잠시 후 다시 확인해
            주세요.
          </div>
        ) : months.length > 0 ? (
          <div className="mt-6 flex flex-col gap-3">
            {months.map((m) => (
              <Link
                key={m.ym}
                href={`/notes/best/${m.ym}`}
                className="card card-hover flex items-center justify-between rounded-[16px] px-5 py-4 no-underline"
              >
                <span className="text-[15px] font-extrabold text-ink">
                  {formatYmKo(m.ym)} 이달의 임장노트
                </span>
                <span className="text-[12px] font-semibold text-text-3">
                  {m.picks.length}편 수록 · 후보 {m.qualifiedCount}편 ›
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-6 card rounded-[16px] px-5 py-8 text-center text-[13px] leading-[1.7] text-text-3">
            아직 기준을 채운 달이 없습니다. 한 달에 {MIN_SCORE}점 이상 노트가{" "}
            {MIN_NOTES_PER_MONTH}편 모이면 자동으로 만들어집니다.
            <br />
            <Link href="/notes/new" className="mt-2 inline-block font-bold text-primary underline">
              임장노트 쓰기
            </Link>
          </div>
        )}

        <p className="mb-8 mt-5 text-[12px] text-text-3">
          <Link href="/notes" className="font-bold text-primary underline">
            공개 임장노트 전체 보기
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
