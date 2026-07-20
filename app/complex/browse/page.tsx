import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import {
  SEOUL_BROWSE_REGIONS,
  listDistrictComplexSummaries,
  regionDisplayName,
  type ComplexSummary,
  type ComplexTxRegion,
} from "@/lib/market/complex-transactions";
import { ComplexSummaryTable } from "../../components/ComplexSummaryTable";

/* ============================================================
   서울 단지 브라우즈 — /complex/browse?district=서울+강남구
   구 선택 칩(강남4구 우선) → 해당 구 단지별 실거래 요약.
   국토부 실거래가(market_transactions) 기반 — 매물 호가 아님.
   비로그인 열람 허용(index 대상).
   ============================================================ */

const DEFAULT_REGION_ID = "gangnam";

function resolveRegion(districtParam: string | undefined): ComplexTxRegion {
  const fallback =
    SEOUL_BROWSE_REGIONS.find((r) => r.id === DEFAULT_REGION_ID) ?? SEOUL_BROWSE_REGIONS[0];
  if (!districtParam) return fallback;
  const q = districtParam.trim().replace(/\s+/g, " ");
  return (
    SEOUL_BROWSE_REGIONS.find(
      (r) => r.id === q || r.name === q || regionDisplayName(r) === q,
    ) ?? fallback
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const region = resolveRegion(sp.district);
  const label = regionDisplayName(region);
  const title = `${label} 아파트 단지별 실거래 현황 | 누구집`;
  const description = `${label} 아파트 단지별 최근 실거래가·평단가·12개월 거래량 — 국토교통부 실거래가 기반(매물 호가 아님). 서울 25개 구 단지 현황을 한 화면에서 확인하세요.`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: "https://nuguzip.com/complex/browse" },
    openGraph: {
      title,
      description,
      siteName: "누구집",
      locale: "ko_KR",
      type: "website",
    },
  };
}

export default async function ComplexBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const sp = await searchParams;
  const region = resolveRegion(sp.district);
  const label = regionDisplayName(region);
  const summaries = await listDistrictComplexSummaries(region, 30).catch(
    () => [] as ComplexSummary[],
  );

  return (
    <PageShell breadcrumb="홈 › 단지 실거래 › 서울 단지 브라우즈" title="서울 단지별 실거래 현황">
      <p className="rise-in mb-4 text-[13px] leading-[1.6] text-text-2">
        국토교통부 실거래가 기반 단지별 현황 — 매물 호가가 아닙니다. 구를 선택해
        최근 실거래가·평단가·거래량을 확인하세요.
      </p>

      {/* 구 선택 칩 — 강남4구 우선 */}
      <div className="rise-in-1 mb-5 flex flex-wrap gap-1.5">
        {SEOUL_BROWSE_REGIONS.map((r) => {
          const active = r.id === region.id;
          return (
            <Link
              key={r.id}
              href={`/complex/browse?district=${encodeURIComponent(regionDisplayName(r))}`}
              className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition ${
                active
                  ? "bg-ink text-white"
                  : "card card-hover text-text-2"
              }`}
            >
              {r.name}
            </Link>
          );
        })}
      </div>

      {/* 해당 구 단지 요약 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          {label} 단지별 현황{" "}
          <span className="text-[11px] font-medium text-text-3">
            최신 거래순 · 상위 {summaries.length}개
          </span>
        </h2>
        <ComplexSummaryTable summaries={summaries} regionId={region.id} />
      </section>

      {/* CTA */}
      <section className="rise-in-3 mb-4 flex flex-wrap gap-2">
        <Link
          href={`/region/${region.id}`}
          className="rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-[var(--shadow-cta)]"
        >
          {region.name} 지역 허브 보기
        </Link>
        <Link href="/map" className="card card-hover px-5 py-3 text-[13px] font-bold text-ink">
          지도에서 보기
        </Link>
        <Link
          href="/notes/new"
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          임장노트 쓰기
        </Link>
      </section>
    </PageShell>
  );
}
