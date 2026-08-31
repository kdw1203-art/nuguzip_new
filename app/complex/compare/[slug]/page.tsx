import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { QaBlock } from "@/app/components/QaBlock";
import { AREA_BANDS } from "@/lib/market/bands";
import {
  buildComplexTxSlug,
  findComplexTxRegionById,
  listComplexTransactions,
  regionDisplayName,
  type ComplexTransactionRecord,
  type ComplexTxRegion,
} from "@/lib/market/complex-transactions";
import {
  buildComplexPairSlug,
  findComplexPair,
  pairWindowMonths,
  pairWindowStartYm,
  parseComplexPairSlug,
  type ComplexPair,
} from "@/lib/market/complex-pairs";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   N10 — 단지 vs 단지 비교 랜딩 · /complex/compare/[slug]
   slug = encodeURIComponent(A) + "--" + encodeURIComponent(B) + "--" + regionId

   ── 이 페이지가 만들어지는 조건 ─────────────────────────────
   조합을 코드가 조립하지 않는다. market_agg.complex_pair_mv 에 행이 있는 조합만
   페이지가 되고 나머지는 404 다(같은 동 · 양쪽 12개월 매매 20건 이상 · 동별 거래
   상위 3개 단지). 기획 문서의 경계 "거래가 얇은 조합의 비교 페이지 양산 금지"를
   문장이 아니라 **데이터로** 지키기 위해서다.

   ── 화면의 숫자는 전부 이번 요청에서 조회한 거래 행에서 나온다 ──
   MV 의 거래 건수는 "이 조합이 페이지가 될 자격이 있는가"를 판정할 때만 쓴다.
   MV 는 하루 한 번 갱신되므로 지금 표에 그린 거래와 어긋날 수 있는데, 머리말
   숫자와 아래 표가 다르면 그건 그냥 거짓말이다. 그래서 출처를 하나로 묶었다.
   ============================================================ */

/* [B001 1단계] 1h → 24h. 이 페이지의 원천(국토부 실거래)은 하루 1번 적재라
   더 자주 재렌더할 이유가 없다 — 26k 페이지 크롤 재렌더가 DB 를 밀던 문제의 반쪽. */
export const revalidate = 86400;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { slug: string }[] {
  return [];
}


/** 12개월 창(최대 236건, 2026-07 실측)을 넉넉히 덮는 표본 크기. 남는 행이 창
    밖까지 닿으면 "이 표본이 창 전체를 덮었다"를 스스로 증명할 수 있다. */
const SAMPLE_LIMIT = 400;

/* ---------- 포맷 ---------- */

function formatKrwShort(krw: number | null | undefined): string {
  if (krw === null || krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

function formatYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

function formatYmd(ym: string, day: number | null): string {
  return day ? `${formatYm(ym)}.${String(day).padStart(2, "0")}` : formatYm(ym);
}

function shortYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(2, 4)}.${ym.slice(4)}` : ym;
}

/** 두 값의 차이 한 문장. 근거가 없으면 null 이다(빈칸을 지어내지 않는다). */
function gapSentence(
  nameA: string,
  valueA: number | null,
  nameB: string,
  valueB: number | null,
  fmt: (v: number) => string,
): string | null {
  if (valueA === null || valueB === null || valueA <= 0 || valueB <= 0) return null;
  const diff = Math.abs(valueA - valueB);
  const ratio = diff / Math.min(valueA, valueB);
  if (ratio < 0.01) return `${nameA}와 ${nameB}가 사실상 같습니다(차이 1% 미만)`;
  const higher = valueA > valueB ? nameA : nameB;
  return `${higher}가 ${fmt(diff)}(${Math.round(ratio * 1000) / 10}%) 높습니다`;
}

/* ---------- 한쪽 단지 집계 ---------- */

interface BandCell {
  count: number;
  avgKrw: number;
  latestKrw: number;
  latestYm: string;
}

interface SideStats {
  name: string;
  /** 12개월 창 안의 거래 (최신순) — 화면의 모든 집계가 여기서 나온다 */
  windowRows: ComplexTransactionRecord[];
  count: number;
  /** 표본이 창 전체를 덮었는지. 아니면 건수는 "이상"으로 읽어야 한다. */
  covered: boolean;
  latest: ComplexTransactionRecord | null;
  avgAmountKrw: number | null;
  avgPerPyeongKrw: number | null;
  medianAreaM2: number | null;
  buildYear: number | null;
  address: string | null;
  bandByLabel: Map<string, BandCell>;
  countByYm: Map<string, number>;
}

function summarizeSide(
  name: string,
  sample: ComplexTransactionRecord[],
  windowStartYm: string,
): SideStats {
  const windowRows = sample.filter((r) => r.contractYm >= windowStartYm);
  // 표본이 창 밖까지 닿았거나(= 더 과거 거래를 이미 봤다), 요청보다 적게 왔다면
  // (= 이 단지 거래가 그게 전부다) 창 안은 빠짐없이 담긴 것이다.
  const covered = sample.length < SAMPLE_LIMIT || windowRows.length < sample.length;

  const amounts = windowRows.map((r) => r.dealAmountKrw).filter((v) => v > 0);
  const perPyeong = windowRows
    .map((r) => r.pricePerPyeongKrw)
    .filter((v): v is number => v !== null && v > 0);
  const areas = windowRows
    .map((r) => r.areaM2)
    .filter((v): v is number => v !== null && v > 0)
    .sort((x, y) => x - y);

  const bandByLabel = new Map<string, BandCell>();
  for (const band of AREA_BANDS) {
    const inBand = windowRows.filter(
      (r) => r.areaM2 !== null && r.areaM2 >= band.min && r.areaM2 < band.max,
    );
    if (inBand.length === 0) continue;
    const latest = inBand[0]; // windowRows 는 최신순이라 첫 행이 최근 거래
    bandByLabel.set(band.label, {
      count: inBand.length,
      avgKrw: inBand.reduce((s, r) => s + r.dealAmountKrw, 0) / inBand.length,
      latestKrw: latest.dealAmountKrw,
      latestYm: latest.contractYm,
    });
  }

  const countByYm = new Map<string, number>();
  for (const r of windowRows) {
    countByYm.set(r.contractYm, (countByYm.get(r.contractYm) ?? 0) + 1);
  }

  return {
    name,
    windowRows,
    count: windowRows.length,
    covered,
    latest: windowRows[0] ?? sample[0] ?? null,
    avgAmountKrw: amounts.length > 0 ? amounts.reduce((s, v) => s + v, 0) / amounts.length : null,
    avgPerPyeongKrw:
      perPyeong.length > 0 ? perPyeong.reduce((s, v) => s + v, 0) / perPyeong.length : null,
    medianAreaM2: areas.length > 0 ? (areas[Math.floor(areas.length / 2)] ?? null) : null,
    buildYear: sample.find((r) => r.buildYear !== null)?.buildYear ?? null,
    address: sample.find((r) => r.address)?.address ?? null,
    bandByLabel,
    countByYm,
  };
}

/* ---------- 로더 ---------- */

interface PageData {
  pair: ComplexPair;
  region: ComplexTxRegion;
  canonicalSlug: string;
  /** 요청 slug 의 단지 순서가 정규 순서와 다른가 (정규 주소로 308) */
  needsRedirect: boolean;
  a: SideStats;
  b: SideStats;
  windowStartYm: string;
  months: readonly string[];
}

/** generateMetadata 와 본문이 같은 렌더에서 한 번만 조회하도록 묶는다. */
const loadPageData = cache(async (slug: string): Promise<PageData | null> => {
  const parsed = parseComplexPairSlug(slug);
  if (!parsed) return null;
  const region = findComplexTxRegionById(parsed.regionId);
  if (!region) return null;

  // findComplexPair 는 조회 실패를 던진다 — "없다"와 "못 읽었다"를 섞지 않기
  // 위해서다. 못 읽은 것을 404 로 바꾸면 크롤러에게 "영구히 없음"이라 말하게 된다.
  const pair = await findComplexPair(region, parsed.first, parsed.second);
  if (!pair) return null;

  const [sampleA, sampleB] = await Promise.all([
    listComplexTransactions(pair.complexA, region, SAMPLE_LIMIT),
    listComplexTransactions(pair.complexB, region, SAMPLE_LIMIT),
  ]);
  // 화이트리스트가 양쪽 20건 이상을 보장한다. 그러니 0건은 "데이터 없음"이 아니라
  // 조회 실패다. 이 라우트는 빌드 프리렌더 대상이 아니므로 여기서 던지면 5xx 가
  // 되고, 크롤러는 "나중에 다시 오라"로 읽는다 — 404 보다 정확한 신호다.
  if (sampleA.length === 0 || sampleB.length === 0) {
    throw new Error(
      `단지 비교 거래를 읽지 못했습니다 — ${pair.complexA}: ${sampleA.length}행 · ${pair.complexB}: ${sampleB.length}행`,
    );
  }

  const windowStartYm = pairWindowStartYm();
  return {
    pair,
    region,
    canonicalSlug: buildComplexPairSlug(pair.complexA, pair.complexB, region.id),
    // 슬러그 문자열이 아니라 **파싱된 이름**을 비교한다. 인코딩 차이(%20 vs +,
    // 대소문자)로 리다이렉트가 무한히 튕기는 것을 막기 위해서다.
    needsRedirect: parsed.first !== pair.complexA || parsed.second !== pair.complexB,
    a: summarizeSide(pair.complexA, sampleA, windowStartYm),
    b: summarizeSide(pair.complexB, sampleB, windowStartYm),
    windowStartYm,
    months: pairWindowMonths(),
  };
});

/* ---------- 메타데이터 ---------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPageData(slug);
  if (!data) {
    return { title: "단지 비교 | 누구집", robots: { index: false, follow: false } };
  }
  const { pair, region, a, b, canonicalSlug } = data;
  const regionLabel = regionDisplayName(region);
  const title = `${pair.complexA} vs ${pair.complexB} 실거래 비교 | 누구집`;
  const description =
    `${regionLabel} ${pair.dong} ${pair.complexA}(최근 12개월 ${a.count}건, 평균 ${formatKrwShort(a.avgAmountKrw)})와 ` +
    `${pair.complexB}(${b.count}건, 평균 ${formatKrwShort(b.avgAmountKrw)})를 국토교통부 실거래가로 비교합니다. ` +
    `면적대별 가격·월별 거래량·최근 거래 이력. 매물 호가가 아닙니다.`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: seoAlternates(`/complex/compare/${canonicalSlug}`),
    openGraph: {
      title,
      description,
      siteName: "누구집",
      locale: "ko_KR",
      type: "website",
    },
  };
}

/* ---------- 작은 표시 조각 ---------- */

function Metric({
  label,
  valueA,
  valueB,
  note,
}: {
  label: string;
  valueA: string;
  valueB: string;
  note?: string;
}) {
  return (
    <tr className="border-b border-border last:border-b-0 align-top">
      <th scope="row" className="py-2.5 pr-2 text-left t-sub font-medium text-text-3">
        {label}
        {note ? <span className="block t-caption text-text-3">{note}</span> : null}
      </th>
      <td className="py-2.5 text-right t-body font-extrabold text-ink">{valueA}</td>
      <td className="py-2.5 text-right t-body font-extrabold text-ink">{valueB}</td>
    </tr>
  );
}

/* ---------- 페이지 ---------- */

export default async function ComplexComparePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadPageData(slug);
  if (!data) notFound();
  const { pair, region, canonicalSlug, needsRedirect, a, b, windowStartYm, months } = data;
  if (needsRedirect) permanentRedirect(`/complex/compare/${canonicalSlug}`);

  const regionLabel = regionDisplayName(region);
  const windowLabel = `${formatYm(windowStartYm)}~${formatYm(months[months.length - 1] ?? windowStartYm)}`;
  const partial = !a.covered || !b.covered;
  const countSuffix = partial ? "건 이상" : "건";

  const pathA = `/complex/tx/${buildComplexTxSlug(a.name, region.id)}`;
  const pathB = `/complex/tx/${buildComplexTxSlug(b.name, region.id)}`;

  /* 면적대 — 어느 한쪽이라도 거래가 있는 구간만, 정의된 순서대로 */
  const sharedBands = AREA_BANDS.filter(
    (band) => a.bandByLabel.has(band.label) || b.bandByLabel.has(band.label),
  );
  const bothBands = sharedBands.filter(
    (band) => a.bandByLabel.has(band.label) && b.bandByLabel.has(band.label),
  );

  const maxMonthly = Math.max(
    1,
    ...months.map((ym) => Math.max(a.countByYm.get(ym) ?? 0, b.countByYm.get(ym) ?? 0)),
  );

  /* 요약 문장 — 근거가 있는 것만 만든다 */
  const priceGap = gapSentence(a.name, a.avgAmountKrw, b.name, b.avgAmountKrw, formatKrwShort);
  const perPyeongGap = gapSentence(
    a.name,
    a.avgPerPyeongKrw,
    b.name,
    b.avgPerPyeongKrw,
    formatKrwShort,
  );

  /* 같은 면적대끼리 비교한 문장 — 면적 차이를 가격 차이로 오해하지 않게 한다 */
  const bandGaps = bothBands
    .map((band) => {
      const cellA = a.bandByLabel.get(band.label);
      const cellB = b.bandByLabel.get(band.label);
      if (!cellA || !cellB) return null;
      const sentence = gapSentence(a.name, cellA.avgKrw, b.name, cellB.avgKrw, formatKrwShort);
      return sentence ? { label: band.label, sentence, cellA, cellB } : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  /* Q&A — 화면에 보이는 값과 같은 근거로만 만든다 (FAQPage JSON-LD 도 이 배열) */
  const qa: FaqItem[] = [];
  if (priceGap) {
    qa.push({
      q: `${a.name}와 ${b.name} 중 어디가 더 비싼가요?`,
      a: `${windowLabel} 국토교통부 매매 신고 기준 평균 거래가는 ${a.name} ${formatKrwShort(
        a.avgAmountKrw,
      )}(${a.count}${countSuffix}), ${b.name} ${formatKrwShort(b.avgAmountKrw)}(${b.count}${countSuffix})로 ${priceGap}. 다만 두 단지의 주력 면적대가 다르면 이 차이는 면적 차이를 함께 반영한 값입니다.`,
    });
  }
  if (bandGaps.length > 0) {
    const g = bandGaps[0];
    if (g) {
      qa.push({
        q: `같은 면적대로 비교하면 어느 쪽이 비싼가요?`,
        a: `전용 ${g.label} 구간만 놓고 보면 ${windowLabel} 평균 거래가가 ${a.name} ${formatKrwShort(
          g.cellA.avgKrw,
        )}(${g.cellA.count}건), ${b.name} ${formatKrwShort(g.cellB.avgKrw)}(${g.cellB.count}건)로 ${g.sentence}.`,
      });
    }
  }
  if (perPyeongGap) {
    qa.push({
      q: `평당가는 어느 쪽이 높나요?`,
      a: `${windowLabel} 거래의 평균 평당가(전용면적 기준)는 ${a.name} ${formatKrwShort(
        a.avgPerPyeongKrw,
      )}, ${b.name} ${formatKrwShort(b.avgPerPyeongKrw)}로 ${perPyeongGap}.`,
    });
  }
  qa.push({
    q: `${a.name}와 ${b.name} 중 거래가 더 활발한 곳은?`,
    a: `${windowLabel} 매매 신고 건수는 ${a.name} ${a.count}${countSuffix}, ${b.name} ${b.count}${countSuffix}입니다. ${
      a.count === b.count
        ? "두 단지의 거래량이 같습니다."
        : `${a.count > b.count ? a.name : b.name}가 ${Math.abs(a.count - b.count)}건 많습니다.`
    } 거래량은 단지 규모(세대수)에 크게 좌우되므로 인기도로 바로 읽기 어렵습니다.`,
  });
  if (a.latest && b.latest) {
    qa.push({
      q: `가장 최근 거래는 언제인가요?`,
      a: `${a.name}는 ${formatYmd(a.latest.contractYm, a.latest.contractDay)} ${formatKrwShort(
        a.latest.dealAmountKrw,
      )}${a.latest.areaM2 !== null ? ` (전용 ${a.latest.areaM2.toFixed(1)}㎡)` : ""}, ${b.name}는 ${formatYmd(
        b.latest.contractYm,
        b.latest.contractDay,
      )} ${formatKrwShort(b.latest.dealAmountKrw)}${
        b.latest.areaM2 !== null ? ` (전용 ${b.latest.areaM2.toFixed(1)}㎡)` : ""
      }가 마지막 신고 건입니다. 실거래 신고는 계약일로부터 최대 30일까지 늦어질 수 있습니다.`,
    });
  }
  if (a.buildYear && b.buildYear) {
    qa.push({
      q: `두 단지 중 어디가 더 새 아파트인가요?`,
      a:
        a.buildYear === b.buildYear
          ? `${a.name}와 ${b.name} 모두 ${a.buildYear}년 준공으로 같습니다.`
          : `${a.name}는 ${a.buildYear}년, ${b.name}는 ${b.buildYear}년 준공으로 ${
              a.buildYear > b.buildYear ? a.name : b.name
            }가 ${Math.abs(a.buildYear - b.buildYear)}년 더 최근입니다.`,
    });
  }

  const jsonLd = [
    breadcrumbJsonLd([
      { name: "홈", url: "/" },
      { name: "단지 비교", url: "/complex/compare" },
      { name: `${a.name} vs ${b.name}`, url: `/complex/compare/${canonicalSlug}` },
    ]),
  ];

  return (
    <PageShell
      breadcrumb={`홈 › 단지 비교 › ${regionLabel} ${pair.dong}`}
      title={`${a.name} vs ${b.name}`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <p className="rise-in mb-5 t-body text-text-2">
        {regionLabel} {pair.dong} · 국토교통부 실거래가(매매) {windowLabel} 기준 ·{" "}
        <strong className="text-ink">
          {a.count + b.count}
          {countSuffix}
        </strong>{" "}
        거래 비교 · 매물 호가 아님
      </p>

      {/* 한눈에 비교 */}
      <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
        <h2 className="t-section text-ink">한눈에 비교</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] t-body">
            <thead>
              <tr className="border-b border-border t-sub text-text-3">
                <th className="py-2 text-left font-medium">항목</th>
                <th className="py-2 text-right font-medium">
                  <Link href={pathA} className="text-primary underline">
                    {a.name}
                  </Link>
                </th>
                <th className="py-2 text-right font-medium">
                  <Link href={pathB} className="text-primary underline">
                    {b.name}
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              <Metric
                label="12개월 매매"
                note={windowLabel}
                valueA={`${a.count}${countSuffix}`}
                valueB={`${b.count}${countSuffix}`}
              />
              <Metric
                label="평균 거래가"
                note="면적 혼합"
                valueA={formatKrwShort(a.avgAmountKrw)}
                valueB={formatKrwShort(b.avgAmountKrw)}
              />
              <Metric
                label="평균 평당가"
                note="전용면적 기준"
                valueA={formatKrwShort(a.avgPerPyeongKrw)}
                valueB={formatKrwShort(b.avgPerPyeongKrw)}
              />
              <Metric
                label="최근 거래"
                valueA={
                  a.latest
                    ? `${formatKrwShort(a.latest.dealAmountKrw)} · ${formatYmd(a.latest.contractYm, a.latest.contractDay)}`
                    : "—"
                }
                valueB={
                  b.latest
                    ? `${formatKrwShort(b.latest.dealAmountKrw)} · ${formatYmd(b.latest.contractYm, b.latest.contractDay)}`
                    : "—"
                }
              />
              <Metric
                label="거래 중앙 면적"
                note="전용"
                valueA={a.medianAreaM2 !== null ? `${a.medianAreaM2.toFixed(1)}㎡` : "—"}
                valueB={b.medianAreaM2 !== null ? `${b.medianAreaM2.toFixed(1)}㎡` : "—"}
              />
              <Metric
                label="준공"
                valueA={a.buildYear ? `${a.buildYear}년` : "—"}
                valueB={b.buildYear ? `${b.buildYear}년` : "—"}
              />
            </tbody>
          </table>
        </div>
        {priceGap && (
          <p className="mt-3 t-sub text-text-2">
            평균 거래가는 {priceGap}. 두 단지의 주력 면적대가 다르면 이 차이에는 면적 차이가
            섞여 있습니다 — 아래 <strong className="text-ink">면적대별 비교</strong>를 함께
            보세요.
          </p>
        )}
      </section>

      {/* 면적대별 비교 */}
      {sharedBands.length > 0 && (
        <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
          <h2 className="t-section text-ink">
            면적대별 비교{" "}
            <span className="t-sub font-medium text-text-3">
              {windowLabel} 평균 · 거래 있는 구간만
            </span>
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] text-left t-body">
              <thead>
                <tr className="border-b border-border t-sub text-text-3">
                  <th className="py-2 font-medium">전용면적</th>
                  <th className="py-2 text-right font-medium">{a.name}</th>
                  <th className="py-2 text-right font-medium">{b.name}</th>
                  <th className="py-2 text-right font-medium">차이</th>
                </tr>
              </thead>
              <tbody>
                {sharedBands.map((band) => {
                  const cellA = a.bandByLabel.get(band.label);
                  const cellB = b.bandByLabel.get(band.label);
                  const diff =
                    cellA && cellB ? Math.abs(cellA.avgKrw - cellB.avgKrw) : null;
                  const higher =
                    cellA && cellB ? (cellA.avgKrw > cellB.avgKrw ? a.name : b.name) : null;
                  return (
                    <tr key={band.slug} className="border-b border-border last:border-b-0">
                      <td className="py-2.5 font-bold text-ink">{band.label}</td>
                      <td className="py-2.5 text-right">
                        {cellA ? (
                          <>
                            <span className="font-extrabold text-ink">
                              {formatKrwShort(cellA.avgKrw)}
                            </span>
                            <span className="ml-1 t-sub text-text-3">
                              {cellA.count}건
                            </span>
                          </>
                        ) : (
                          <span className="text-text-3">거래 없음</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        {cellB ? (
                          <>
                            <span className="font-extrabold text-ink">
                              {formatKrwShort(cellB.avgKrw)}
                            </span>
                            <span className="ml-1 t-sub text-text-3">
                              {cellB.count}건
                            </span>
                          </>
                        ) : (
                          <span className="text-text-3">거래 없음</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right t-sub text-text-2">
                        {diff !== null && higher ? (
                          <>
                            {formatKrwShort(diff)}
                            <span className="ml-1 t-caption text-text-3">{higher}↑</span>
                          </>
                        ) : (
                          <span className="text-text-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {bothBands.length === 0 && (
            <p className="mt-2 t-sub text-text-3">
              두 단지가 같이 거래된 면적 구간이 없습니다. 이 경우 평균 거래가 비교는 면적이
              다른 집을 견주는 셈이므로, 위 표의 &ldquo;평균 평당가&rdquo;를 보는 편이
              낫습니다.
            </p>
          )}
        </section>
      )}

      {/* 월별 거래량 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="t-section text-ink">
          월별 거래량{" "}
          <span className="t-sub font-medium text-text-3">{windowLabel} · 계약월 기준</span>
        </h2>
        <div className="mt-3 flex items-center gap-4 t-sub text-text-2">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-3 rounded-[2px]"
              style={{ background: "var(--primary)" }}
            />
            {a.name}
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-3 rounded-[2px]"
              style={{ background: "var(--primary)", opacity: 0.35 }}
            />
            {b.name}
          </span>
        </div>
        <div className="mt-3 flex h-[110px] items-end gap-[5px]">
          {months.map((ym) => {
            const ca = a.countByYm.get(ym) ?? 0;
            const cb = b.countByYm.get(ym) ?? 0;
            return (
              <div
                key={ym}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
                title={`${formatYm(ym)} · ${a.name} ${ca}건 · ${b.name} ${cb}건`}
              >
                <div className="flex h-[96px] w-full items-end justify-center gap-[2px]">
                  <div
                    className="w-1/2 rounded-t-[3px]"
                    style={{
                      height: `${ca > 0 ? 6 + Math.round((ca / maxMonthly) * 88) : 2}px`,
                      background: ca > 0 ? "var(--primary)" : "var(--border)",
                    }}
                  />
                  <div
                    className="w-1/2 rounded-t-[3px]"
                    style={{
                      height: `${cb > 0 ? 6 + Math.round((cb / maxMonthly) * 88) : 2}px`,
                      background: cb > 0 ? "var(--primary)" : "var(--border)",
                      opacity: cb > 0 ? 0.35 : 1,
                    }}
                  />
                </div>
                <span className="t-caption text-text-3">{shortYm(ym)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 최근 거래 이력 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="t-section text-ink">
          최근 거래 이력{" "}
          <span className="t-sub font-medium text-text-3">각 단지 최근 6건</span>
        </h2>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          {[a, b].map((side, idx) => (
            <div key={side.name}>
              <h3 className="t-body font-extrabold text-ink">
                <Link href={idx === 0 ? pathA : pathB} className="text-primary underline">
                  {side.name}
                </Link>
              </h3>
              <table className="mt-2 w-full text-left t-sub">
                <thead>
                  <tr className="border-b border-border t-caption text-text-3">
                    <th className="py-1.5 font-medium">계약일</th>
                    <th className="py-1.5 font-medium">전용</th>
                    <th className="py-1.5 text-right font-medium">거래금액</th>
                  </tr>
                </thead>
                <tbody>
                  {side.windowRows.slice(0, 6).map((t, i) => (
                    <tr
                      key={`${t.contractYm}-${t.contractDay ?? 0}-${t.areaM2 ?? 0}-${t.floor ?? 0}-${i}`}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="py-2 text-text-2">
                        {formatYmd(t.contractYm, t.contractDay)}
                      </td>
                      <td className="py-2 text-text-2">
                        {t.areaM2 !== null ? `${t.areaM2.toFixed(1)}㎡` : "—"}
                      </td>
                      <td className="py-2 text-right font-extrabold text-ink">
                        {formatKrwShort(t.dealAmountKrw)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <QaBlock items={qa} />

      {/* 방법론·출처 */}
      <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
        <h2 className="t-section text-ink">이 비교를 만든 방법</h2>
        <ul className="mt-2 flex flex-col gap-1.5 t-sub text-text-2">
          <li>
            출처: 국토교통부 실거래가 공개시스템 아파트 매매 신고 자료. 해제된 거래는
            제외했습니다. 매물 호가·시세가 아닙니다.
          </li>
          <li>
            집계 구간: 계약월 {windowLabel}. 표에 적힌 건수·평균가는 이 구간에서 실제로
            조회한 거래를 직접 센 값입니다.
            {partial
              ? " 표본 상한에 걸린 단지가 있어 건수는 최소값(이상)으로 표기했습니다."
              : ""}
          </li>
          <li>
            수록 기준: 같은 법정동에 있고 양쪽 모두 최근 12개월 매매 20건 이상인 조합만
            비교 페이지를 만듭니다. 거래가 얇으면 평균이 한두 건에 휘둘려 비교가 의미를
            잃기 때문입니다.
          </li>
          <li>
            평균 거래가는 면적을 섞은 값이라 단지 간 면적 구성이 다르면 그대로 비교하기
            어렵습니다. 같은 면적대끼리 본 값이 위 &ldquo;면적대별 비교&rdquo; 표입니다.
          </li>
          <li>
            실거래 신고는 계약일로부터 최대 30일까지 늦어질 수 있어 최근 1~2개월 건수는
            나중에 늘어날 수 있습니다.
          </li>
        </ul>
      </section>

      {/* 다음 행동 */}
      <section className="rise-in-3 mb-4 flex flex-wrap gap-2">
        <Link
          href="/notes/new"
          className="rounded-xl bg-primary px-5 py-3 t-body font-bold text-white shadow-[var(--shadow-cta)]"
        >
          두 단지 임장노트 쓰기
        </Link>
        <Link href={pathA} className="card tile px-5 py-3 t-body font-bold text-ink">
          {a.name} 실거래
        </Link>
        <Link href={pathB} className="card tile px-5 py-3 t-body font-bold text-ink">
          {b.name} 실거래
        </Link>
        <Link
          href={`/region/${region.id}`}
          className="card tile px-5 py-3 t-body font-bold text-ink"
        >
          {region.name} 지역 허브
        </Link>
        <Link
          href="/complex/compare"
          className="card tile px-5 py-3 t-body font-bold text-ink"
        >
          다른 단지 비교
        </Link>
      </section>
    </PageShell>
  );
}
