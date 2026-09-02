import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { QaBlock } from "@/app/components/QaBlock";
import { CitationBlock } from "@/app/components/CitationBlock";
import { PressSummaryBlock } from "@/app/components/PressSummaryBlock";
import {
  getSeasonReport,
  seasonBySlug,
  seasonVerdict,
  seasonVerdictText,
  SEASON_LIFT_THRESHOLD_PCT,
} from "@/lib/reports/seasonal";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   N12 — 계절(이사철) 리포트.

   이 페이지가 하는 일은 하나다: "2~3월은 이사철이라 거래가 몰린다" 같은
   통념을 국토교통부 실거래 집계로 검증하고, 나온 결과를 그대로 적는다.
   통념이 맞으면 맞다고, 반대면 반대라고, 차이가 없으면 없다고 쓴다.
   판정 문턱(±5%)은 lib/reports/seasonal.ts 에 상수로 고정돼 있어
   페이지가 결론에 맞춰 기준을 고를 수 없다.

   관측 안 된 계절-연도는 숨기지 않고 "왜 아직 못 세는지"까지 적는다
   (예: "2026년 — 7월 신고 진행 중(잠정), 8월 집계 없음").
   빠진 달을 조용히 무시하면 절반짜리 숫자가 계절 전체인 척하게 된다.

   관측된 계절-연도가 하나도 없으면 404 — 없는 리포트를 만들지 않는다.
   조회 실패는 잡지 않고 던진다(→ 5xx). generateStaticParams 가 빈 배열이라
   빌드 프리렌더 대상이 아니므로 던져도 빌드가 깨지지 않는다. DB 장애를
   404 로 바꾸면 크롤러에게 "이 URL 은 없어졌다" 고 확정 신고하는 꼴이다.
   ============================================================ */

export const revalidate = 3600;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

function eok(krw: number | null): string {
  if (krw === null || !Number.isFinite(krw) || krw <= 0) return "—";
  const e = krw / 100_000_000;
  return `${(e >= 10 ? e.toFixed(1) : e.toFixed(2)).replace(/\.?0+$/, "")}억`;
}

function pct(v: number): string {
  const s = Math.abs(v).toFixed(1);
  if (v > 0) return `+${s}%`;
  if (v < 0) return `-${s}%`;
  return "0.0%";
}

function n(v: number): string {
  return Math.round(v).toLocaleString("ko-KR");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const def = seasonBySlug(slug);
  if (!def) {
    return { title: "계절 리포트 | 내집나우", robots: { index: false, follow: false } };
  }
  const report = await getSeasonReport(slug);
  if (!report) {
    return {
      title: `${def.label}(${def.monthsLabel}) 실거래 리포트 | 내집나우`,
      robots: { index: false, follow: true },
    };
  }
  const title = `${def.label} ${def.monthsLabel} 아파트 거래, 정말 몰릴까 — 실거래로 검증 | 내집나우`;
  const description = `${def.monthsLabel} 아파트 매매 실거래를 같은 해 다른 달과 비교했습니다. ${report.latest.year}년 ${def.monthsLabel} 거래 ${report.latest.txCount.toLocaleString("ko-KR")}건, 국토교통부 신고 기준.`;
  const path = `/reports/season/${slug}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://nuguzip.com${path}`, type: "article" },
  };
}

export default async function SeasonReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!seasonBySlug(slug)) notFound();
  const report = await getSeasonReport(slug);
  if (!report) notFound();

  const { def, latest, yoy } = report;

  /* 판정 — 같은 해 계절 외 월과의 비교가 있는 연도만 대상으로 한다. */
  const compared = report.years.filter((y) => y.vsOffSeason !== null);
  const verdicts = compared.map((y) => seasonVerdict(y.vsOffSeason!.liftPct));
  const higherCount = verdicts.filter((v) => v === "higher").length;
  const lowerCount = verdicts.filter((v) => v === "lower").length;

  /* G12 — 발췌해도 완결되는 첫 문단. 비교가 불가능하면 그 사실을 문장으로 쓴다. */
  let leadSentence: string;
  if (compared.length === 0) {
    leadSentence = `${latest.year}년 ${def.monthsLabel} 아파트 매매 실거래는 ${latest.txCount.toLocaleString("ko-KR")}건입니다. 같은 해 다른 달의 집계가 아직 없어 "${def.label}에 거래가 몰리는가"는 이 데이터로 판단할 수 없습니다 — 국토교통부 실거래 신고 기준.`;
  } else {
    const c = compared[compared.length - 1]!;
    const v = seasonVerdict(c.vsOffSeason!.liftPct);
    leadSentence = `${c.year}년 ${def.monthsLabel}의 아파트 매매 실거래는 월평균 ${n(c.vsOffSeason!.seasonPerMonth)}건으로, 같은 해 같은 지역(${c.vsOffSeason!.regionCount}곳)의 다른 달 월평균 ${n(c.vsOffSeason!.offPerMonth)}건보다 ${pct(c.vsOffSeason!.liftPct)} ${seasonVerdictText(v)} — 국토교통부 실거래 신고 기준.`;
  }

  const citation =
    compared.length === 0
      ? `내집나우(nuguzip.com) 집계에 따르면, ${latest.year}년 ${def.monthsLabel} 아파트 매매 실거래는 ${latest.txCount.toLocaleString("ko-KR")}건이다 (국토교통부 실거래 신고 기반, 같은 해 다른 달과의 비교는 아직 불가).`
      : `내집나우(nuguzip.com) 집계에 따르면, ${compared[compared.length - 1]!.year}년 ${def.monthsLabel}의 아파트 매매 실거래는 같은 해 같은 지역의 다른 달 대비 월평균 ${pct(compared[compared.length - 1]!.vsOffSeason!.liftPct)} 수준이었다 (국토교통부 실거래 신고 기반).`;

  const faq: FaqItem[] = [
    {
      q: `${def.monthsLabel}에 아파트 거래가 정말 몰리나요?`,
      a:
        compared.length === 0
          ? `아직 판단할 수 없습니다. ${latest.year}년 ${def.monthsLabel} 실거래는 ${latest.txCount.toLocaleString("ko-KR")}건으로 집계됐지만, 비교 기준이 될 같은 해 다른 달의 집계가 없습니다. 비교 없이 "몰린다/뜸하다"를 말하지 않습니다.`
          : `${compared[compared.length - 1]!.year}년 기준으로는 ${leadSentence.replace(/^[^,]*년 /, "")} 다만 관측된 해가 ${report.years.length}개라 ${report.canClaimSeasonality ? "여러 해에 걸친 경향으로 볼 여지가 있습니다" : "이것만으로 매년 반복되는 계절성이라고 말하기는 어렵습니다"}.`,
    },
    {
      q: `이 비교는 어떻게 계산했나요?`,
      a: `${def.monthsLabel}의 월평균 거래량과, 같은 해 ${def.monthsLabel}을 제외한 달들의 월평균 거래량을 비교했습니다. 달마다 집계되는 지역 수가 다르면 계절성이 아니라 수집 범위를 재게 되므로, 비교 대상 달에 모두 등장하는 공통 지역으로만 계산합니다. 신고 기한(계약 후 30일)이 지나지 않은 잠정 월과, 계절의 일부 달만 있는 해는 아예 제외합니다.`,
    },
  ];
  if (yoy) {
    faq.push({
      q: `${def.monthsLabel} 거래량은 작년보다 늘었나요?`,
      a: `두 해 ${def.monthsLabel}에 모두 집계된 지역 ${yoy.regionCount}곳 기준으로, ${yoy.fromYear}년 ${yoy.fromTx.toLocaleString("ko-KR")}건에서 ${yoy.toYear}년 ${yoy.toTx.toLocaleString("ko-KR")}건으로 ${pct(yoy.txDeltaPct)} 변동했습니다.`,
    });
  }

  /* N18 — 기사 리드로 옮길 수 있는 문장. 위에서 쓴 실측치 재사용만 한다. */
  const pressSentences: string[] = [
    compared.length === 0
      ? `내집나우가 국토교통부 실거래 신고 자료를 집계한 결과, ${latest.year}년 ${def.monthsLabel} 아파트 매매 실거래는 ${latest.txCount.toLocaleString("ko-KR")}건으로 나타났다. 같은 해 다른 달 집계가 없어 계절 간 비교는 하지 않았다.`
      : `내집나우가 국토교통부 실거래 신고 자료를 집계한 결과, ${compared[compared.length - 1]!.year}년 ${def.monthsLabel}의 아파트 매매 실거래는 월평균 ${n(compared[compared.length - 1]!.vsOffSeason!.seasonPerMonth)}건으로, 같은 해 같은 지역의 다른 달(월평균 ${n(compared[compared.length - 1]!.vsOffSeason!.offPerMonth)}건) 대비 ${pct(compared[compared.length - 1]!.vsOffSeason!.liftPct)} 수준이었다.`,
  ];
  if (compared.length >= 2) {
    pressSentences.push(
      `비교가 가능한 ${compared.length}개 연도 가운데 ${def.monthsLabel}이 다른 달보다 거래가 많았던 해는 ${higherCount}개, 적었던 해는 ${lowerCount}개였다 (±${SEASON_LIFT_THRESHOLD_PCT}% 이내는 차이 없음으로 분류).`,
    );
  }
  if (yoy) {
    pressSentences.push(
      `두 해 모두 집계된 지역 ${yoy.regionCount}곳만 놓고 보면 ${def.monthsLabel} 거래량은 ${yoy.fromYear}년 대비 ${pct(yoy.txDeltaPct)} 변동했다.`,
    );
  }

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${def.label}(${def.monthsLabel}) 아파트 실거래 검증 리포트`,
    description: leadSentence,
    inLanguage: "ko-KR",
    author: { "@type": "Organization", name: "내집나우", url: "https://nuguzip.com" },
    publisher: { "@id": "https://nuguzip.com/#organization" },
    ...(report.updatedAt
      ? { dateModified: report.updatedAt, datePublished: report.updatedAt }
      : {}),
    mainEntityOfPage: `https://nuguzip.com/reports/season/${def.slug}`,
  };

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "월간 실거래 리포트", url: "/reports" },
    { name: `${def.label} 리포트`, url: `/reports/season/${def.slug}` },
  ]);

  return (
    <PageShell breadcrumb={`실거래 리포트 › ${def.label}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([articleJsonLd, crumbs]) }}
      />
      <div className="mx-auto max-w-[860px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">
          {def.label}({def.monthsLabel}), 정말 거래가 몰릴까
        </h1>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-1">{leadSentence}</p>

        {/* 검증 대상이 된 통념을 먼저 밝힌다 — 이 페이지가 무엇에 답하는지 */}
        <div className="rise-in-1 mt-4 card rounded-[16px] p-5">
          <p className="text-[12px] font-extrabold text-text-3">검증 대상 통념</p>
          <p className="mt-1 text-[14px] font-bold leading-[1.6] text-ink">“{def.claim}”</p>
          <p className="mt-1.5 text-[12px] leading-[1.6] text-text-3">{def.rationale}</p>
        </div>

        {!report.canClaimSeasonality && (
          <p className="rise-in-1 mt-3 text-[12px] leading-[1.6] text-text-3">
            지금까지 {def.monthsLabel}이 온전히 집계된 해는 {report.years.length}개(
            {report.years.map((y) => `${y.year}년`).join(", ")})입니다. 한 해만으로는 그 해가
            특이했을 가능성을 배제할 수 없어,{" "}
            <strong className="text-ink">매년 반복되는 계절성이라고 말하지 않습니다.</strong>
          </p>
        )}

        {/* 연도별 계절 vs 계절 외 */}
        <section className="rise-in-2 card mt-5 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            연도별 {def.monthsLabel} vs 같은 해 다른 달
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] text-text-3">
                  <th className="py-2 font-medium">연도</th>
                  <th className="py-2 text-right font-medium">{def.monthsLabel} 거래</th>
                  <th className="py-2 text-right font-medium">{def.monthsLabel} 월평균</th>
                  <th className="py-2 text-right font-medium">다른 달 월평균</th>
                  <th className="py-2 text-right font-medium">차이</th>
                </tr>
              </thead>
              <tbody>
                {report.years.map((y) => (
                  <tr key={y.year} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 font-bold text-ink">{y.year}년</td>
                    <td className="py-2.5 text-right text-text-2">
                      {y.txCount.toLocaleString("ko-KR")}건
                    </td>
                    <td className="py-2.5 text-right font-extrabold text-ink">
                      {y.vsOffSeason ? `${n(y.vsOffSeason.seasonPerMonth)}건` : "—"}
                    </td>
                    <td className="py-2.5 text-right text-text-2">
                      {y.vsOffSeason ? `${n(y.vsOffSeason.offPerMonth)}건` : "—"}
                    </td>
                    <td
                      className={`py-2.5 text-right font-bold ${
                        !y.vsOffSeason
                          ? "text-text-3"
                          : seasonVerdict(y.vsOffSeason.liftPct) === "higher"
                            ? "text-danger"
                            : seasonVerdict(y.vsOffSeason.liftPct) === "lower"
                              ? "text-primary"
                              : "text-text-3"
                      }`}
                    >
                      {y.vsOffSeason ? pct(y.vsOffSeason.liftPct) : "비교 불가"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {compared.length > 0 && (
            <p className="mt-3 text-[11px] leading-[1.6] text-text-3">
              비교는 해당 연도의 비교 대상 달에 <strong>모두 등장하는 공통 지역</strong>으로만
              계산했습니다 (가장 최근 연도 {compared[compared.length - 1]!.vsOffSeason!.regionCount}
              곳). 달마다 집계 지역 수가 달라 생기는 착시를 없애기 위해서입니다. ±
              {SEASON_LIFT_THRESHOLD_PCT}% 이내는 &ldquo;차이 없음&rdquo;으로 봅니다.
            </p>
          )}
          {report.pending.length > 0 && (
            <p className="mt-2 text-[11px] leading-[1.6] text-text-3">
              아직 세지 않은 해:{" "}
              {report.pending.map((p) => `${p.year}년(${p.reason})`).join(" · ")}. 계절의 일부
              달만 있거나 신고가 진행 중인 해는 계절 합계에 넣지 않습니다.
            </p>
          )}
        </section>

        {/* 전년 대비 */}
        {yoy && (
          <section className="rise-in-3 card mt-5 p-[var(--pad-card)]">
            <h2 className="text-[15px] font-extrabold text-ink">
              {yoy.fromYear}년 → {yoy.toYear}년 {def.monthsLabel} 비교
            </h2>
            <p className="mt-2 text-[13px] leading-[1.7] text-text-2">
              두 해 {def.monthsLabel}에 모두 집계된 지역{" "}
              <strong className="text-ink">{yoy.regionCount}곳</strong> 기준입니다.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-[12px] border border-border px-4 py-3">
                <p className="text-[11px] font-semibold text-text-3">거래량</p>
                <p className="mt-1 text-[15px] font-extrabold text-ink">
                  {yoy.fromTx.toLocaleString("ko-KR")}건 → {yoy.toTx.toLocaleString("ko-KR")}건{" "}
                  <span className={yoy.txDeltaPct >= 0 ? "text-danger" : "text-primary"}>
                    {pct(yoy.txDeltaPct)}
                  </span>
                </p>
              </div>
              <div className="rounded-[12px] border border-border px-4 py-3">
                <p className="text-[11px] font-semibold text-text-3">평균 매매가</p>
                <p className="mt-1 text-[15px] font-extrabold text-ink">
                  {eok(yoy.fromAvgKrw)} → {eok(yoy.toAvgKrw)}{" "}
                  {yoy.avgDeltaPct !== null && (
                    <span className={yoy.avgDeltaPct >= 0 ? "text-danger" : "text-primary"}>
                      {pct(yoy.avgDeltaPct)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 최신 관측 연도의 지역별 */}
        {report.topRegions.length > 0 && (
          <section className="rise-in-4 card mt-5 p-[var(--pad-card)]">
            <h2 className="text-[15px] font-extrabold text-ink">
              {latest.year}년 {def.monthsLabel} 거래 상위 지역{" "}
              <span className="text-[11px] font-medium text-text-3">
                거래량순 · 상위 {report.topRegions.length}곳
              </span>
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] text-text-3">
                    <th className="py-2 font-medium">지역</th>
                    <th className="py-2 text-right font-medium">{def.monthsLabel} 거래</th>
                    <th className="py-2 text-right font-medium">평균 매매가</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topRegions.map((r) => (
                    <tr key={r.regionName} className="border-b border-border last:border-b-0">
                      <td className="py-2.5 font-bold text-ink">{r.regionName}</td>
                      <td className="py-2.5 text-right text-text-2">
                        {r.txCount.toLocaleString("ko-KR")}건
                      </td>
                      <td className="py-2.5 text-right font-extrabold text-ink">{eok(r.avgKrw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-[1.6] text-text-3">
              평균가는 면적·타입 구분 없는 거래량 가중 평균입니다. 해제(취소) 신고분은 집계에서
              제외했습니다 —{" "}
              <Link href="/methodology" className="font-bold text-primary underline">
                집계 방법론 보기
              </Link>
            </p>
          </section>
        )}

        <div className="rise-in-5 mt-5">
          <CitationBlock sentence={citation} />
          <PressSummaryBlock
            sentences={pressSentences}
            asOfLabel={`${latest.year}년 ${def.monthsLabel} 실거래 신고 기준`}
            provisional={false}
          />
          <QaBlock title={`${def.label} 실거래 Q&A`} items={faq} />
        </div>

        <p className="mb-8 text-[12px] text-text-3">
          <Link href="/reports" className="font-bold text-primary underline">
            월간 실거래 리포트
          </Link>
          {" · "}
          <Link href="/analysis/timing" className="font-bold text-primary underline">
            매수·매도 타이밍 분석
          </Link>
          {" · "}
          <Link href="/tx" className="font-bold text-primary underline">
            지역별 실거래 상세
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
