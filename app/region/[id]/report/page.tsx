import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { REGION_CATALOG, findCatalogRegionById } from "@/lib/region/catalog";
import { recentReportSlugs } from "@/lib/region/monthly-report";
import { seoAlternates } from "@/lib/seo/alternates";

/* [#79] 월간 리포트 아카이브 인덱스 — /region/[id]/report
   최근 완결 월 목록으로 월 페이지에 링크한다. 목록 자체는 데이터 조회가 없어
   가볍고, 각 월 페이지가 데이터 없으면 404 로 정직하게 말한다. */

export const revalidate = 86400;

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const region = findCatalogRegionById(id);
  if (!region) {
    return { title: "지역을 찾을 수 없습니다 | 내집나우", robots: { index: false, follow: false } };
  }
  const title = `${region.name} 월간 아파트 시장 리포트 아카이브`;
  const description = `${region.name} 아파트 매매 거래량·평균가·상위 실거래를 월별로 고정한 스냅샷 아카이브. 매월 자동 축적됩니다.`;
  return { title, description, alternates: seoAlternates(`/region/${id}/report`) };
}

export default async function RegionReportIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const region = findCatalogRegionById(id);
  if (!region) notFound();

  const slugs = recentReportSlugs(12);

  return (
    <PageShell breadcrumb={`지역 › ${region.name} › 월간 리포트`}>
      <h1 className="rise-in t-title tracking-tight text-ink">
        {region.name} 월간 리포트 아카이브
      </h1>
      <p className="rise-in-1 mt-1.5 max-w-[640px] t-body text-text-2">
        매월 1일이 지나면 직전 달의 {region.name} 아파트 시장이 스냅샷으로 고정됩니다 —
        거래량·평균가·중앙값·상위 실거래·가격지수. &ldquo;그때 얼마였지&rdquo;가 궁금할 때
        찾는 페이지입니다.
      </p>

      <div className="rise-in-1 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {slugs.map((s) => (
          <Link
            key={s}
            href={`/region/${id}/report/${s}`}
            className="card tile rounded-2xl px-4 py-3.5"
          >
            <div className="t-section text-ink tabular-nums">
              {s.replace("-", "년 ")}월
            </div>
            <div className="mt-0.5 t-sub text-text-3">월간 시장 스냅샷 →</div>
          </Link>
        ))}
      </div>

      <div className="rise-in-2 mt-6">
        <Link
          href={`/region/${id}`}
          className="chip border border-line bg-surface px-3.5 py-2 t-body font-bold text-primary"
        >
          ← {region.name} 지역 홈 (최신 시황)
        </Link>
      </div>

      {/* [#106] 다른 지역 아카이브 — 62개 월간 축의 내부 링크 그물 */}
      <section className="rise-in-3 mt-7">
        <h2 className="mb-2 px-1 t-body font-extrabold text-ink">다른 지역 월간 리포트</h2>
        <div className="flex flex-wrap gap-1.5">
          {REGION_CATALOG.filter((r) => r.id !== id)
            .slice(0, 16)
            .map((r) => (
              <Link
                key={r.id}
                href={`/region/${r.id}/report`}
                className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2"
              >
                {r.name}
              </Link>
            ))}
        </div>
      </section>
    </PageShell>
  );
}
