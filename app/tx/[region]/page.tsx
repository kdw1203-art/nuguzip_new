import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { findTxRegionBySlug, type BandCell, type TxRegionSummary } from "@/lib/market/tx-bands";
import { BAND_KIND_LABEL, type BandKind } from "@/lib/market/bands";
import { formatKrwShort, formatYmRange } from "@/lib/market/format";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   지역 실거래 구간 허브 — /tx/[region]
   그 지역의 면적대·가격대 랜딩을 한자리에 모은다.
   region 슬러그는 market_transactions.region_name 의 공백을 하이픈으로 바꾼 값이며,
   DB 에 없는 값은 404 (임의 문자열로 빈 페이지가 양산되는 걸 막는다).
   ============================================================ */

export const revalidate = 3600;

async function load(regionSlug: string): Promise<TxRegionSummary | null> {
  return findTxRegionBySlug(regionSlug).catch(() => null);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string }>;
}): Promise<Metadata> {
  const { region: slug } = await params;
  const region = await load(slug);
  if (!region) {
    return { title: "지역 실거래 구간 | 누구집", robots: { index: false, follow: false } };
  }
  const range = formatYmRange(region.firstYm, region.latestYm);
  const title = `${region.name} 아파트 실거래 ${region.txCount.toLocaleString("ko-KR")}건 — 면적대·가격대별 | 누구집`;
  const description = `${region.name} 아파트 매매 실거래를 면적대(${region.areaCells.length}구간)·가격대(${region.priceCells.length}구간)로 나눠 봅니다. 국토교통부 신고 기준${
    range ? ` ${range}` : ""
  } ${region.txCount.toLocaleString("ko-KR")}건. 매물 호가가 아닙니다.`;
  const path = `/tx/${encodeURIComponent(region.slug)}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://nuguzip.com${path}`, type: "website" },
  };
}

function BandTable({
  region,
  kind,
  cells,
}: {
  region: TxRegionSummary;
  kind: BandKind;
  cells: BandCell[];
}) {
  if (cells.length === 0) return null;
  return (
    <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
      <h2 className="text-[15px] font-extrabold text-ink">
        {BAND_KIND_LABEL[kind]}별{" "}
        <span className="text-[11px] font-medium text-text-3">
          {kind === "area" ? "전용면적 기준" : "거래금액 기준"} · {cells.length}구간
        </span>
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[460px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] text-text-3">
              <th className="py-2 font-medium">{kind === "area" ? "전용면적" : "거래금액"}</th>
              <th className="py-2 font-medium">거래</th>
              <th className="py-2 font-medium">단지</th>
              <th className="py-2 text-right font-medium">중앙값</th>
              <th className="py-2 text-right font-medium">평균</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => (
              <tr key={c.bandSlug} className="border-b border-border last:border-b-0">
                <td className="py-2.5">
                  <Link
                    href={`/tx/${encodeURIComponent(region.slug)}/${kind}/${c.bandSlug}`}
                    className="font-bold text-primary underline"
                  >
                    {c.bandLabel}
                  </Link>
                </td>
                <td className="py-2.5 text-text-2">{c.txCount.toLocaleString("ko-KR")}건</td>
                <td className="py-2.5 text-text-2">{c.complexCount.toLocaleString("ko-KR")}곳</td>
                <td className="py-2.5 text-right font-extrabold text-ink">
                  {formatKrwShort(c.medianKrw)}
                </td>
                <td className="py-2.5 text-right text-text-2">{formatKrwShort(c.avgKrw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function TxRegionPage({
  params,
}: {
  params: Promise<{ region: string }>;
}) {
  const { region: slug } = await params;
  const region = await load(slug);
  if (!region) notFound();

  const range = formatYmRange(region.firstYm, region.latestYm);
  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "지역별 실거래 구간", url: "/tx" },
    { name: region.name, url: `/tx/${encodeURIComponent(region.slug)}` },
  ]);

  return (
    <PageShell
      breadcrumb={`홈 › 지역별 실거래 구간 › ${region.name}`}
      title={`${region.name} 면적대·가격대별 실거래`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        국토교통부 아파트 매매 실거래{" "}
        <strong className="text-ink">{region.txCount.toLocaleString("ko-KR")}건</strong>
        {range && ` (${range} 신고 기준)`} · 단지{" "}
        <strong className="text-ink">{region.complexCount.toLocaleString("ko-KR")}곳</strong>. 매물
        호가가 아닙니다.
      </p>

      <BandTable region={region} kind="area" cells={region.areaCells} />
      <BandTable region={region} kind="price" cells={region.priceCells} />

      <p className="mb-8 text-[12px] leading-[1.7] text-text-3">
        거래 10건 미만 구간은 평균이 한두 건에 크게 흔들려 따로 페이지를 만들지 않습니다. 면적은
        전용면적 기준이며, 계약 후 신고까지 시차가 있어 최근 달 건수는 더 늘어날 수 있습니다.
        <br />
        <Link href="/tx" className="font-bold text-primary underline">
          다른 지역 보기
        </Link>
        {" · "}
        <Link href="/complex/browse" className="font-bold text-primary underline">
          단지별 실거래 브라우즈
        </Link>
      </p>
    </PageShell>
  );
}
