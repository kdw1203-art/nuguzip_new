import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../../../components/PageShell";
import {
  findTxRegionBySlug,
  listBandComplexes,
  type BandCell,
  type BandComplex,
  type TxRegionSummary,
} from "@/lib/market/tx-bands";
import { BAND_KIND_LABEL, isBandKind, type BandKind } from "@/lib/market/bands";
import { formatKrwShort, formatYm, formatYmRange, m2ToPyeong } from "@/lib/market/format";
import { encodeComplexId } from "@/lib/complex/complex-store";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";

/* ============================================================
   지역 × 구간 실거래 랜딩 — /tx/[region]/[kind]/[band]
   kind = "area" | "price" · band = lib/market/bands.ts 의 슬러그
   집계는 Postgres 뷰(tx_band_landing_source / tx_band_complex_source)에서 오고,
   거래 10건 미만 셀은 페이지를 만들지 않는다(404) — 표본이 작은 평균은
   숫자처럼 보이지만 사실상 잡음이라, 사실이 아닌 것을 사실처럼 내보내게 된다.
   ============================================================ */

export const revalidate = 3600;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): Params[] {
  return [];
}


type Params = { region: string; kind: string; band: string };

type Loaded = {
  region: TxRegionSummary;
  kind: BandKind;
  cell: BandCell;
  siblings: BandCell[];
  crossCells: BandCell[];
};

/**
 * null 은 오직 "그런 구간이 없다"(→ 404)일 때만 돌려준다.
 *
 * 예전엔 `findTxRegionBySlug(...).catch(() => null)` 이었다. 그러면 DB 조회 실패가
 * 404 로 둔갑한다 — 크롤러에게 404 는 "이 URL 은 없어졌다" 라는 확정 신호라
 * 색인에서 빠지지만, 5xx 는 "나중에 다시 오라" 다. 일시적 장애를 영구 삭제로
 * 신고하는 셈이었다. 그래서 조회 실패는 그대로 던진다(ISR 이 직전 정상 페이지를
 * 계속 서빙하고 다음 요청에 재시도한다).
 */
async function load(params: Params): Promise<Loaded | null> {
  if (!isBandKind(params.kind)) return null;
  const kind = params.kind;
  const region = await findTxRegionBySlug(params.region);
  if (!region) return null;
  const cells = kind === "area" ? region.areaCells : region.priceCells;
  const cell = cells.find((c) => c.bandSlug === params.band);
  if (!cell) return null;
  return {
    region,
    kind,
    cell,
    siblings: cells.filter((c) => c.bandSlug !== cell.bandSlug),
    crossCells: kind === "area" ? region.priceCells : region.areaCells,
  };
}

function pageTitle(region: TxRegionSummary, kind: BandKind, cell: BandCell): string {
  return kind === "area"
    ? `${region.name} ${cell.bandLabel} 아파트 실거래`
    : `${region.name} ${cell.bandLabel} 아파트 실거래`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const p = await params;
  const data = await load(p);
  if (!data) {
    return { title: "실거래 구간 | 누구집", robots: { index: false, follow: false } };
  }
  const { region, kind, cell } = data;
  const range = formatYmRange(cell.firstYm, cell.latestYm);
  const title = `${pageTitle(region, kind, cell)} — 중앙값 ${formatKrwShort(cell.medianKrw)} | 누구집`;
  const description = `${region.name} ${cell.bandLabel} 아파트 매매 실거래 ${cell.txCount.toLocaleString(
    "ko-KR",
  )}건 (${range} 신고 기준) · 중앙값 ${formatKrwShort(cell.medianKrw)} · 평균 ${formatKrwShort(
    cell.avgKrw,
  )} · 범위 ${formatKrwShort(cell.minKrw)}~${formatKrwShort(cell.maxKrw)}. 단지 ${cell.complexCount.toLocaleString(
    "ko-KR",
  )}곳의 국토교통부 실거래가입니다. 매물 호가가 아닙니다.`;
  const path = `/tx/${encodeURIComponent(region.slug)}/${kind}/${cell.bandSlug}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://nuguzip.com${path}`, type: "website" },
  };
}

export default async function TxBandPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const data = await load(p);
  if (!data) notFound();

  const { region, kind, cell, siblings, crossCells } = data;
  // 단지 목록은 이 페이지의 부속 정보다(핵심 통계는 이미 cell 에 있다). 그래서
  // 실패해도 페이지 전체를 죽이지 않지만, "못 읽었다" 와 "없다" 는 구분해서 적는다.
  // 이 셀은 정의상 거래 10건 이상이므로 정상 조회에서 빈 목록이 나올 수는 없다.
  let complexes: BandComplex[] = [];
  let complexesFailed = false;
  try {
    complexes = await listBandComplexes(region.name, kind, cell.bandSlug, 40);
  } catch (e) {
    complexesFailed = true;
    logger.error(
      `[/tx/${region.slug}/${kind}/${cell.bandSlug}] 단지 목록 조회 실패:`,
      e instanceof Error ? e.message : String(e),
    );
  }
  const range = formatYmRange(cell.firstYm, cell.latestYm);
  const regionHref = `/tx/${encodeURIComponent(region.slug)}`;
  const pyeong = m2ToPyeong(cell.avgAreaM2);

  const stats: Array<{ label: string; value: string; hint?: string }> = [
    { label: "거래 건수", value: `${cell.txCount.toLocaleString("ko-KR")}건`, hint: range },
    { label: "거래된 단지", value: `${cell.complexCount.toLocaleString("ko-KR")}곳` },
    {
      label: "중앙값",
      value: formatKrwShort(cell.medianKrw),
      hint: "절반은 이 금액보다 낮게 거래",
    },
    { label: "평균", value: formatKrwShort(cell.avgKrw) },
    {
      label: "최저 ~ 최고",
      value: `${formatKrwShort(cell.minKrw)} ~ ${formatKrwShort(cell.maxKrw)}`,
    },
    ...(cell.avgAreaM2 !== null
      ? [
          {
            label: "평균 전용면적",
            value: `${cell.avgAreaM2.toFixed(1)}㎡`,
            hint: pyeong ? `약 ${pyeong}평` : undefined,
          },
        ]
      : []),
    ...(cell.avgPerPyeongKrw !== null && cell.avgPerPyeongKrw > 0
      ? [
          {
            label: "평당 평균",
            value: formatKrwShort(cell.avgPerPyeongKrw),
            hint: "전용면적 기준",
          },
        ]
      : []),
  ];

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "지역별 실거래 구간", url: "/tx" },
    { name: region.name, url: regionHref },
    {
      name: `${BAND_KIND_LABEL[kind]} ${cell.bandLabel}`,
      url: `${regionHref}/${kind}/${cell.bandSlug}`,
    },
  ]);

  return (
    <PageShell
      breadcrumb={`홈 › 지역별 실거래 구간 › ${region.name} › ${BAND_KIND_LABEL[kind]} ${cell.bandLabel}`}
      title={pageTitle(region, kind, cell)}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        국토교통부 아파트 매매 실거래{" "}
        <strong className="text-ink">{cell.txCount.toLocaleString("ko-KR")}건</strong>
        {range && ` · ${range} 신고 기준`} · 중앙값{" "}
        <strong className="text-ink">{formatKrwShort(cell.medianKrw)}</strong>. 매물 호가가 아니라
        실제 체결·신고된 금액입니다.
      </p>

      {/* 구간 요약 */}
      <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          {cell.bandLabel} 요약{" "}
          <span className="text-[11px] font-medium text-text-3">
            {kind === "area" ? "전용면적 기준" : "거래금액 기준"}
          </span>
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="border-b border-border py-2.5">
              <div className="text-[11px] text-text-3">{s.label}</div>
              <div className="text-[15px] font-extrabold leading-tight text-ink">{s.value}</div>
              {s.hint && <div className="mt-0.5 text-[11px] text-text-3">{s.hint}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* 단지 목록 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          이 구간에서 거래된 단지{" "}
          <span className="text-[11px] font-medium text-text-3">
            거래 많은 순 · 상위 {Math.min(complexes.length, 40)}곳
          </span>
        </h2>
        {complexesFailed ? (
          <p className="py-6 text-center text-[13px] text-text-3">
            단지별 내역을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
          </p>
        ) : complexes.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">
            이 구간에서 거래된 단지 내역이 아직 정리되지 않았습니다.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] text-text-3">
                  <th className="py-2 font-medium">단지</th>
                  <th className="py-2 font-medium">거래</th>
                  <th className="py-2 text-right font-medium">평균</th>
                  <th className="py-2 text-right font-medium">최저~최고</th>
                  <th className="py-2 text-right font-medium">최근</th>
                </tr>
              </thead>
              <tbody>
                {complexes.map((c) => (
                  <tr key={c.name} className="border-b border-border last:border-b-0">
                    <td className="py-2.5">
                      <Link
                        href={`/complex/${encodeComplexId(region.name, c.name)}`}
                        className="font-bold text-primary underline"
                      >
                        {c.name}
                      </Link>
                      {c.avgAreaM2 !== null && (
                        <span className="ml-1.5 text-[11px] text-text-3">
                          {c.avgAreaM2.toFixed(0)}㎡
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-text-2">{c.txCount}건</td>
                    <td className="py-2.5 text-right font-extrabold text-ink">
                      {formatKrwShort(c.avgKrw)}
                    </td>
                    <td className="py-2.5 text-right text-[12px] text-text-2">
                      {formatKrwShort(c.minKrw)}~{formatKrwShort(c.maxKrw)}
                    </td>
                    <td className="py-2.5 text-right text-[12px] text-text-3">
                      {formatYm(c.latestYm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 같은 지역 다른 구간 — 내부 링크 */}
      {siblings.length > 0 && (
        <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            {region.name} 다른 {BAND_KIND_LABEL[kind]}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {siblings.map((s) => (
              <Link
                key={s.bandSlug}
                href={`${regionHref}/${kind}/${s.bandSlug}`}
                className="card-hover rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-ink"
              >
                {s.bandLabel}
                <span className="ml-1 font-medium text-text-3">
                  {s.txCount.toLocaleString("ko-KR")}건
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {crossCells.length > 0 && (
        <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            {region.name} {BAND_KIND_LABEL[kind === "area" ? "price" : "area"]}별로 보기
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {crossCells.map((s) => (
              <Link
                key={s.bandSlug}
                href={`${regionHref}/${kind === "area" ? "price" : "area"}/${s.bandSlug}`}
                className="card-hover rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-ink"
              >
                {s.bandLabel}
                <span className="ml-1 font-medium text-text-3">
                  {s.txCount.toLocaleString("ko-KR")}건
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="mb-8 text-[12px] leading-[1.7] text-text-3">
        평균·중앙값은 이 구간에 신고된 거래만으로 계산한 값이며, 특정 단지의 현재 가격이나 지역
        전체 시세를 뜻하지 않습니다. 계약 후 신고까지 시차가 있어 최근 달 건수는 더 늘어날 수
        있습니다. 면적은 전용면적 기준입니다.
        <br />
        <Link href={regionHref} className="font-bold text-primary underline">
          {region.name} 구간 전체
        </Link>
        {" · "}
        <Link href="/tx" className="font-bold text-primary underline">
          다른 지역
        </Link>
      </p>
    </PageShell>
  );
}
