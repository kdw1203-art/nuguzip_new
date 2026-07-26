import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { PageShell } from "@/app/components/PageShell";
import {
  listDigestWeeks,
  ARCHIVE_WEEKS,
  MIN_ITEMS,
  type DigestWeekSummary,
} from "@/lib/digest/archive";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { logger } from "@/lib/log";

/* ============================================================
   N23 — 주간 다이제스트 웹 아카이브(목록).

   /digest 는 "지금부터 최근 7일" 이라 매일 내용이 바뀐다. 여기 실린 주소는
   주가 고정돼 있어 언제 열어도 같은 주를 말한다 — 그래서 인용할 수 있고
   색인 자산이 된다.

   조회 실패와 "아직 실을 주가 없다" 를 화면에서 구분한다.
   ============================================================ */

export const revalidate = 3600;

type IndexData = { weeks: DigestWeekSummary[]; loadError: string | null };

const load = cache(async (): Promise<IndexData> => {
  try {
    return { weeks: await listDigestWeeks(), loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      "[/digest/archive] 주간 아카이브를 읽지 못했습니다 — 주가 없는 것이 아니라 조회가 실패했습니다:",
      message,
    );
    return { weeks: [], loadError: message };
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const { loadError } = await load();
  const base = buildPageMetadata({
    title: "주간 다이제스트 아카이브",
    description:
      "주 단위로 고정된 부동산 주간 요약 기록입니다. 그 주에 실제로 수집된 뉴스와 이웃 글, 시장 온도만 싣습니다.",
    path: "/digest/archive",
  });
  return loadError ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function DigestArchivePage() {
  const { weeks, loadError } = await load();

  return (
    <PageShell breadcrumb="주간 다이제스트 › 아카이브">
      <div className="mx-auto max-w-[760px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">주간 다이제스트 아카이브</h1>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-2">
          <Link href="/digest" className="font-bold text-primary underline">
            이번 주 다이제스트
          </Link>
          는 오늘로부터 최근 7일이라 매일 내용이 바뀝니다. 여기 있는 주소는{" "}
          <strong className="text-ink">주가 고정</strong>돼 있어 언제 열어도 같은 주를 보여
          줍니다. 주는 한국시간 월요일부터 일요일까지이고, 주소는 그 주 월요일 날짜입니다.
        </p>
        <p className="rise-in-1 mt-2 text-[12px] leading-[1.6] text-text-3">
          진행 중인 이번 주는 아직 끝나지 않았으므로 넣지 않습니다. 수집된 항목이{" "}
          {MIN_ITEMS}건 미만인 주도 만들지 않습니다 — 두어 줄짜리 요약을 다이제스트라고 부르지
          않기 위해서입니다. 최근 {ARCHIVE_WEEKS}주까지 보관합니다.
        </p>

        {loadError ? (
          <div className="mt-6 card rounded-[16px] px-5 py-8 text-center text-[13px] leading-[1.7] text-text-3">
            아카이브를 <strong className="text-ink">불러오지 못했습니다</strong>.
            <br />
            기록이 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻입니다. 잠시 후 다시 확인해
            주세요.
          </div>
        ) : weeks.length > 0 ? (
          <div className="mt-6 flex flex-col gap-3">
            {weeks.map((w) => (
              <Link
                key={w.slug}
                href={`/digest/${w.slug}`}
                className="card card-hover flex items-center justify-between gap-3 rounded-[16px] px-5 py-4 no-underline"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold text-ink">
                    {w.ordinalLabel}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-text-3">{w.rangeLabel}</span>
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-text-3">
                  뉴스 {w.newsCount} · 이웃 글 {w.communityCount} ›
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-6 card rounded-[16px] px-5 py-8 text-center text-[13px] leading-[1.7] text-text-3">
            아직 아카이브에 실을 주가 없습니다. 한 주에 {MIN_ITEMS}건 이상이 쌓이면 그 주가
            끝난 뒤 자동으로 만들어집니다.
          </div>
        )}

        <p className="mb-8 mt-5 text-[12px] text-text-3">
          <Link href="/digest" className="font-bold text-primary underline">
            이번 주 다이제스트 보기
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
