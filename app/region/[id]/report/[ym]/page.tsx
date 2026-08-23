import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { findCatalogRegionById } from "@/lib/region/catalog";
import {
  getRegionMonthlyReport,
  parseReportMonth,
  recentReportSlugs,
  type RegionMonthlyReport,
} from "@/lib/region/monthly-report";
import { formatKrwShort } from "@/lib/market/format";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { logger } from "@/lib/log";

/* ============================================================
   [#79] 월간 지역 리포트 — /region/[id]/report/2026-07
   시간이 지날수록 쌓이는 세 번째 프로그래매틱 축(지역 250p · 청약 주간 · 월간 리포트).
   "그때 얼마였지" 검색의 수신처: 특정 월에 고정된 시장 스냅샷.

   원칙(지역 허브와 동일):
   - 실데이터만. 값이 없으면 그 문장·칸을 만들지 않는다.
   - 완결 월(지난달까지)만 존재한다 — 진행 중인 달은 아직 "월간" 사실이 아니다.
   - 데이터가 전무한 월·지역 조합은 notFound (+ noindex 메타) — 껍데기 색인 방지.
   ============================================================ */

export const revalidate = 86400; // 완결 월 스냅샷 — 신고 지연 반영을 위해 하루 1회면 충분

export async function generateStaticParams(): Promise<
  Array<{ id: string; ym: string }>
> {
  return []; // 요청 시 ISR — 62지역 × 12개월을 빌드마다 만들지 않는다
}

function fmtYmLabel(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

function pct(a: number, b: number): number {
  return ((a - b) / b) * 100;
}

type Params = { id: string; ym: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id, ym: slug } = await params;
  const region = findCatalogRegionById(id);
  const ym = parseReportMonth(slug);
  if (!region || !ym) {
    return {
      title: "리포트를 찾을 수 없습니다 | 누구집",
      robots: { index: false, follow: false },
    };
  }
  const label = fmtYmLabel(ym);
  const title = `${region.name} 아파트 시장 ${label} 리포트 — 거래량·평균가·신고 실거래`;
  const description = `${label} ${region.name} 아파트 매매 신고 건수, 평균·중앙값 매매가, 상위 실거래, 전월세 신고 건수를 국토교통부·한국부동산원 데이터로 정리한 월간 스냅샷.`;
  return {
    title,
    description,
    alternates: seoAlternates(`/region/${id}/report/${slug}`),
    openGraph: { title, description, type: "article" },
  };
}

export default async function RegionMonthlyReportPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id, ym: slug } = await params;
  const region = findCatalogRegionById(id);
  const ym = parseReportMonth(slug);
  if (!region || !ym) notFound();

  let report: RegionMonthlyReport | null = null;
  try {
    report = await getRegionMonthlyReport(id, region.name, ym);
  } catch (e) {
    logger.error(`[report] ${id} ${ym} 조회 실패`, e);
    throw e; // 못 읽음 = 5xx (없음과 다르다 — 크롤러에게 "다시 오라")
  }
  if (!report) notFound(); // 데이터가 전무한 월 — 껍데기를 만들지 않는다

  const label = fmtYmLabel(ym);
  const volDelta =
    report.tradeCount !== null && report.prevTradeCount !== null && report.prevTradeCount > 0
      ? pct(report.tradeCount, report.prevTradeCount)
      : null;
  const idxDelta =
    report.index && report.index.prev !== null && report.index.prev > 0
      ? pct(report.index.value, report.index.prev)
      : null;

  const facts: Array<{ label: string; value: string; sub?: string }> = [];
  if (report.tradeCount !== null) {
    facts.push({
      label: "매매 신고",
      value: `${report.tradeCount.toLocaleString("ko-KR")}건`,
      sub:
        volDelta === null
          ? undefined
          : `전월 대비 ${Math.abs(volDelta) < 1 ? "비슷" : `${Math.abs(volDelta).toFixed(0)}% ${volDelta > 0 ? "증가" : "감소"}`}`,
    });
  }
  if (report.avgDealKrw !== null) {
    facts.push({ label: "평균 매매가", value: formatKrwShort(report.avgDealKrw) });
  }
  if (report.medianDealKrw !== null) {
    facts.push({
      label: "중앙값",
      value: formatKrwShort(report.medianDealKrw),
      sub: report.sampleTruncated
        ? `표본 ${report.sampleCount.toLocaleString("ko-KR")}건(상한)`
        : `${report.sampleCount.toLocaleString("ko-KR")}건 기준`,
    });
  }
  if (report.rentCount !== null) {
    facts.push({ label: "전월세 신고", value: `${report.rentCount.toLocaleString("ko-KR")}건` });
  }
  if (report.index) {
    facts.push({
      label: "매매가격지수",
      value: report.index.value.toFixed(1),
      sub:
        idxDelta === null
          ? "한국부동산원"
          : `전월 ${idxDelta > 0 ? "+" : ""}${idxDelta.toFixed(2)}%`,
    });
  }

  /* 서술 문단 — 있는 값으로만 조립 */
  const paragraphs: string[] = [];
  if (report.tradeCount !== null) {
    const s: string[] = [
      `${label} ${region.name} 아파트 매매 신고는 ${report.tradeCount.toLocaleString("ko-KR")}건입니다.`,
    ];
    if (volDelta !== null) {
      s.push(
        `전월(${report.prevTradeCount!.toLocaleString("ko-KR")}건)과 견주면 ${
          Math.abs(volDelta) < 1 ? "비슷한 수준" : `${Math.abs(volDelta).toFixed(0)}% ${volDelta > 0 ? "늘었" : "줄었"}습니다`
        }.`,
      );
    }
    if (report.medianDealKrw !== null) {
      s.push(`신고 가격의 중앙값은 ${formatKrwShort(report.medianDealKrw)}이었습니다.`);
    }
    paragraphs.push(s.join(" "));
  }
  if (report.index) {
    paragraphs.push(
      `한국부동산원 매매가격지수는 ${report.index.value.toFixed(1)}${
        idxDelta === null ? "입니다." : `로 전월 대비 ${idxDelta > 0 ? "+" : ""}${idxDelta.toFixed(2)}% ${idxDelta > 0 ? "올랐" : idxDelta < 0 ? "내렸" : "보합이었"}습니다.`
      }`,
    );
  }

  const slugsNear = recentReportSlugs(12);
  const idxInList = slugsNear.indexOf(slug);
  const newer = idxInList > 0 ? slugsNear[idxInList - 1] : null;
  const older = idxInList >= 0 && idxInList < slugsNear.length - 1 ? slugsNear[idxInList + 1] : null;

  return (
    <PageShell breadcrumb={`지역 › ${region.name} › 월간 리포트`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: region.name, url: `/region/${id}` },
              { name: `${label} 리포트`, url: `/region/${id}/report/${slug}` },
            ]),
          ]),
        }}
      />

      <h1 className="rise-in text-[22px] font-extrabold tracking-tight text-ink md:text-[26px]">
        {region.name} 아파트 시장 — {label}
      </h1>
      <p className="rise-in-1 mt-1.5 text-[13px] text-text-2">
        {label}에 고정된 월간 스냅샷입니다. 신고 지연분이 이후 반영될 수 있어 하루 1회
        갱신됩니다. 최신 시황은{" "}
        <Link href={`/region/${id}`} className="font-bold text-primary">
          {region.name} 지역 페이지
        </Link>
        에서 보세요.
      </p>

      {facts.length > 0 && (
        <div className="rise-in-1 mt-4 grid grid-cols-2 gap-1.5 md:grid-cols-5">
          {facts.map((f) => (
            <div key={f.label} className="card rounded-xl px-3 py-3 text-center">
              <div className="text-[10px] text-text-3">{f.label}</div>
              <div className="mt-0.5 truncate text-[16px] font-extrabold text-ink tabular-nums">
                {f.value}
              </div>
              {f.sub && <div className="mt-0.5 truncate text-[10px] text-text-3">{f.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {paragraphs.length > 0 && (
        <section className="rise-in-2 card mt-4 rounded-[16px] px-5 py-4">
          {paragraphs.map((p) => (
            <p key={p.slice(0, 20)} className="text-[14px] leading-[1.9] text-text-1">
              {p}
            </p>
          ))}
        </section>
      )}

      {report.topDeals.length > 0 && (
        <section className="rise-in-2 mt-6">
          <h2 className="mb-2 px-1 text-[15px] font-extrabold text-ink">
            {label} 상위 실거래{" "}
            <span className="text-[12px] font-medium text-text-3">신고 금액순 5건</span>
          </h2>
          <div className="card overflow-x-auto rounded-2xl px-4 py-2">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-text-3">
                  <th className="py-2 pr-3 font-semibold">단지</th>
                  <th className="py-2 pr-3 text-right font-semibold">전용면적</th>
                  <th className="py-2 pr-3 text-right font-semibold">신고가</th>
                  <th className="py-2 text-right font-semibold">계약일</th>
                </tr>
              </thead>
              <tbody>
                {report.topDeals.map((d, i) => (
                  <tr
                    key={`${d.complexName}-${i}`}
                    className="border-b border-divider last:border-0"
                  >
                    <td className="py-2.5 pr-3 font-bold text-ink">{d.complexName}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-1">
                      {d.areaM2 !== null ? `${Math.round(d.areaM2)}㎡` : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-extrabold tabular-nums text-ink">
                      {formatKrwShort(d.priceKrw)}
                    </td>
                    <td className="py-2.5 text-right text-[11px] tabular-nums text-text-3">
                      {d.contractDay !== null ? `${Number(ym.slice(4, 6))}.${d.contractDay}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-caption mt-1.5 px-1 text-text-3">
            국토교통부 실거래 신고 기준(취소 신고 제외). 신고 기한이 계약 후 30일이라 이후
            추가·정정될 수 있습니다.
          </p>
        </section>
      )}

      {/* 이전/다음 달 + 아카이브 — 프로그래매틱 그물 */}
      <div className="rise-in-3 mt-6 flex flex-wrap items-center gap-2">
        {older && (
          <Link
            href={`/region/${id}/report/${older}`}
            className="chip border border-line bg-surface px-3.5 py-2 text-[12.5px] font-bold text-text-1"
          >
            ← {older.replace("-", "년 ")}월
          </Link>
        )}
        {newer && (
          <Link
            href={`/region/${id}/report/${newer}`}
            className="chip border border-line bg-surface px-3.5 py-2 text-[12.5px] font-bold text-text-1"
          >
            {newer.replace("-", "년 ")}월 →
          </Link>
        )}
        <Link
          href={`/region/${id}/report`}
          className="chip border border-line bg-surface px-3.5 py-2 text-[12.5px] font-bold text-primary"
        >
          전체 월간 아카이브
        </Link>
        <Link
          href={`/region/${id}`}
          className="chip border border-line bg-surface px-3.5 py-2 text-[12.5px] font-bold text-primary"
        >
          {region.name} 지역 홈
        </Link>
      </div>

      <p className="mt-6 text-[11px] leading-[1.7] text-text-3">
        출처: 국토교통부 실거래가 공개시스템(신고 기준), 한국부동산원 매매가격지수. 본
        페이지는 공개 데이터의 산술 정리이며 투자 권유가 아닙니다.
      </p>
    </PageShell>
  );
}
