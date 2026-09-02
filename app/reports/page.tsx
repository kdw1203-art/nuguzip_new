import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { AdSenseUnit } from "@/app/components/ads/AdSenseUnit";
import { listReportMonths, formatYmKo, type ReportMonthSummary } from "@/lib/reports/monthly";
import { listSeasonAvailability, type SeasonAvailability } from "@/lib/reports/seasonal";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { logger } from "@/lib/log";

export const revalidate = 3600;

/* ============================================================
   S11/G7 — 월간 리포트 목록. 데이터가 있는 달만 나열한다(빈 달 페이지 양산 금지).

   ── "못 읽었다" 와 "없다" 를 섞지 않는다 ─────────────────────────
   이 페이지는 빌드 때 프리렌더되는데(revalidate 1시간), 로더가 서비스 롤
   키를 요구하는 바람에 CI 러너에서 항상 빈 배열을 받아 "아직 집계된 월이
   없어요" 가 HTML 에 굳어 있었다. 같은 데이터를 읽는 런타임 라우트
   /sitemap-reports.xml 은 세 달을 정상으로 돌려주고 있었다.
   지금은 lib/reports/monthly.ts 가 anon 으로도 읽고, 실패하면 던진다.
   여기서는 그 예외를 잡아 세 상태를 각각 다르게 렌더한다 —
   프리렌더 라우트라 던지면 빌드가 깨지기 때문이다:
     1) 정상 — 월 목록
     2) 조회 실패 — 그렇게 말하고 noindex (깨진 껍데기를 색인시키지 않는다)
     3) 정말로 빈 결과 — "아직 집계된 월이 없다" 는 별개의 문장
   ============================================================ */

type ReportsIndexData = {
  months: ReportMonthSummary[];
  /**
   * N12 — 계절 리포트 중 "관측된" 것만. 월 요약만으로 판정되는 순수 계산이라
   * 조회가 추가로 늘지 않는다.
   */
  seasons: SeasonAvailability[];
  /** 조회 자체가 실패한 사유. null 이면 "읽었고 결과가 이만큼" 이라는 뜻이다. */
  loadError: string | null;
};

/**
 * generateMetadata 와 페이지 본문이 같은 렌더에서 각각 부르므로 react cache 로
 * 한 번만 질의한다.
 */
const loadReportsIndex = cache(async (): Promise<ReportsIndexData> => {
  try {
    const months = await listReportMonths();
    return { months, seasons: listSeasonAvailability(months), loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      "[/reports] 월간 집계를 읽지 못했습니다 — 리포트가 없는 것이 아니라 조회가 실패했습니다:",
      message,
    );
    return { months: [], seasons: [], loadError: message };
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const { loadError } = await loadReportsIndex();
  const base = buildPageMetadata({
    title: "월간 아파트 실거래 리포트",
    description:
      "국토교통부 실거래 집계로 매월 자동 생성되는 지역별 아파트 거래량·평균가 리포트 목록.",
    path: "/reports",
  });
  // 조회가 실패한 상태의 껍데기를 색인시키지 않는다. 다음 재검증에서 성공하면 사라진다.
  return loadError ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function ReportsIndexPage() {
  const { months, seasons, loadError } = await loadReportsIndex();

  /* 항목 46d — 실재하는 월간 리포트 목록을 ItemList 로 기술. 값은 페이지가
     이미 렌더하는 실데이터에서만 오고, 조회 실패면 노드를 내보내지 않는다. */
  const itemListJsonLd =
    months.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "월간 아파트 실거래 리포트",
          numberOfItems: months.length,
          itemListElement: months.slice(0, 60).map((m, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${formatYmKo(m.ym)} 실거래 리포트`,
            url: `https://naezipnow.com/reports/${m.ym}`,
          })),
        }
      : null;

  return (
    <PageShell breadcrumb="월간 실거래 리포트">
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      <div className="mx-auto max-w-[760px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">월간 아파트 실거래 리포트</h1>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-2">
          국토교통부 실거래 신고 집계에서 매월 자동으로 만들어지는 리포트입니다.
          사람이 쓰는 시황 글이 아니라 데이터 요약이며, 모든 수치는{" "}
          <Link href="/methodology" className="font-bold text-primary underline">
            공개된 방법론
          </Link>
          을 따릅니다.
        </p>

        {loadError ? (
          <div className="mt-6 card rounded-[16px] px-5 py-8 text-center text-[13px] leading-[1.7] text-text-3">
            월간 집계를 <strong className="text-ink">불러오지 못했습니다</strong>.
            <br />
            리포트가 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻입니다. 잠시 후 다시
            확인해 주세요.
          </div>
        ) : months.length > 0 ? (
          /* 고도화 38 — 연도별 구분·앵커. 지금은 몇 달이지만 매월 자동으로
             늘어나는 목록이라, 해가 바뀌기 전에 구조를 넣어 둔다. 연도 칩은
             실재하는 연도가 2개 이상일 때만 그린다(칩 1개는 장식이다). */
          (() => {
            const byYear = new Map<string, ReportMonthSummary[]>();
            for (const m of months) {
              const y = m.ym.slice(0, 4);
              const bucket = byYear.get(y);
              if (bucket) bucket.push(m);
              else byYear.set(y, [m]);
            }
            const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
            return (
              <div className="mt-6 flex flex-col gap-5">
                {years.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {years.map((y) => (
                      <a
                        key={y}
                        href={`#y${y}`}
                        className="chip border border-line bg-bg px-3 py-1.5 text-[12px] font-bold text-text-2"
                      >
                        {y}년
                      </a>
                    ))}
                  </div>
                )}
                {years.map((y) => (
                  <section key={y} id={`y${y}`}>
                    <h2 className="mb-2.5 text-[15px] font-extrabold text-text-2">
                      {y}년{" "}
                      <span className="text-[12px] font-medium text-text-3">
                        {byYear.get(y)!.length}개월
                      </span>
                    </h2>
                    <div className="flex flex-col gap-3">
                      {byYear.get(y)!.map((m, i) => (
                        <Link
                          key={m.ym}
                          prefetch={false}
                          href={`/reports/${m.ym}`}
                          className={`rise-in-${Math.min(i + 2, 6)} card tile flex items-center justify-between rounded-[16px] px-5 py-4 no-underline`}
                        >
                          <span className="text-[15px] font-extrabold text-ink">
                            {formatYmKo(m.ym)} 실거래 리포트
                          </span>
                          <span className="text-[12px] font-semibold text-text-3">
                            {m.regionCount}개 지역 · {m.txCount.toLocaleString("ko-KR")}건 ›
                          </span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            );
          })()
        ) : (
          <div className="mt-6 card rounded-[16px] px-5 py-8 text-center text-[13px] text-text-3">
            아직 집계된 월이 없어요. 실거래 수집이 쌓이면 자동으로 생성됩니다.
          </div>
        )}

        {/* N12 — 계절(이사철) 검증 리포트. 계절의 모든 달이 확정 집계된 해가
            하나라도 있어야 목록에 나온다. 절반만 모인 계절은 만들지 않는다. */}
        {seasons.length > 0 && (
          <section className="rise-in-4 mt-8">
            <h2 className="text-[17px] font-extrabold text-ink">이사철 통념 검증 리포트</h2>
            <p className="mt-1.5 text-[13px] leading-[1.7] text-text-2">
              &ldquo;2~3월은 이사철이라 거래가 몰린다&rdquo; 같은 말을 실거래 신고 집계로
              확인합니다. 같은 해 다른 달과 <strong className="text-ink">같은 지역끼리만</strong>{" "}
              비교하며, 신고가 진행 중인 잠정 월은 넣지 않습니다.
            </p>
            <div className="mt-3 flex flex-col gap-3">
              {seasons.map((s) => (
                <Link
                  key={s.def.slug}
                  href={`/reports/season/${s.def.slug}`}
                  className="card tile flex items-center justify-between rounded-[16px] px-5 py-4 no-underline"
                >
                  <span>
                    <span className="block text-[15px] font-extrabold text-ink">
                      {s.def.label} ({s.def.monthsLabel})
                    </span>
                    <span className="mt-0.5 block text-[12px] text-text-3">{s.def.claim}</span>
                  </span>
                  <span className="shrink-0 pl-3 text-[12px] font-semibold text-text-3">
                    {s.observedYears.map((y) => `${y}년`).join(" · ")} ›
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 애드센스 데스크탑 유닛 — 목록 하단 빈공간. 모바일 미노출. */}
        <AdSenseUnit className="mt-8" />
      </div>
    </PageShell>
  );
}
