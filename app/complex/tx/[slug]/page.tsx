import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../../components/PageShell";
import { ComplexReviews } from "../../ComplexReviews";
import {
  parseComplexTxSlug,
  findComplexTxRegionById,
  regionDisplayName,
  listComplexTransactions,
  summarizeAreaBands,
  summarizeMonthly,
  findApartmentComplexByName,
  type ComplexTransactionRecord,
} from "@/lib/market/complex-transactions";
import { encodeComplexId } from "@/lib/complex/complex-store";
import { getPublicRecordsForComplex } from "@/lib/market/public-records";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   단지 실거래 상세 — /complex/tx/[slug]
   slug = encodeURIComponent(단지명) + "--" + regionId
   국토부 실거래가(market_transactions) 기반 — 매물 호가 아님.
   비로그인 열람 허용(index 대상) · ISR 1시간.
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


/* ---------- 포맷 헬퍼 ---------- */

/** 원(KRW) → "28.6억" / "9,800만" */
function formatKrwShort(krw: number | null | undefined): string {
  if (krw === null || krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

/** "202607" → "2026.07" */
function formatYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

/** "202607" + 15 → "2026.07.15" */
function formatYmd(ym: string, day: number | null): string {
  return day ? `${formatYm(ym)}.${String(day).padStart(2, "0")}` : formatYm(ym);
}

/** "202607" → "26.07" */
function shortYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(2, 4)}.${ym.slice(4)}` : ym;
}

/**
 * generateMetadata 와 본문이 같은 렌더에서 한 번만 조회하도록 묶는다
 * (/complex/compare/[slug] 와 같은 방식).
 *
 * null 은 오직 **없다**는 뜻이다 — 슬러그가 깨졌거나, 모르는 지역이거나,
 * 이 단지의 신고된 거래가 정말 0건일 때. 못 읽은 경우는 여기서 던지고
 * 5xx 가 된다.
 */
const loadPageData = cache(
  async (
    slug: string,
  ): Promise<{
    complexName: string;
    region: NonNullable<ReturnType<typeof findComplexTxRegionById>>;
    transactions: ComplexTransactionRecord[];
  } | null> => {
    const parsed = parseComplexTxSlug(slug);
    if (!parsed) return null;
    const region = findComplexTxRegionById(parsed.regionId);
    if (!region) return null;
    /* 예전에는 여기 .catch(() => []) 가 있었다. 그러면 조회 실패가 아래 0건
       가드로 흘러 notFound() + robots:noindex,nofollow 가 됐다 — 잠깐 못 읽은
       것을 크롤러에게 "이 페이지는 없어졌다"고 확정 신고한 셈이다. 이제 실패는
       그대로 던져 5xx("나중에 다시 오라")가 되고, 404 는 진짜 0건일 때만 난다. */
    const transactions = await listComplexTransactions(parsed.complexName, region, 30);
    if (transactions.length === 0) return null;
    return { complexName: parsed.complexName, region, transactions };
  },
);

/* ---------- 메타데이터 ---------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPageData(slug);
  if (!data) {
    return { title: "단지 실거래 | 누구집", robots: { index: false, follow: false } };
  }
  const { complexName, region, transactions } = data;
  const latest = transactions[0];
  const regionLabel = regionDisplayName(region);
  const title = `${complexName} 실거래가 — 최근 ${formatKrwShort(latest.dealAmountKrw)} | 누구집`;
  const description = `${regionLabel} ${complexName} 아파트 실거래 — 최근 거래 ${formatKrwShort(
    latest.dealAmountKrw,
  )} (${formatYmd(latest.contractYm, latest.contractDay)}). 국토교통부 실거래가 기반 거래 이력·면적대별 시세·월별 거래량을 확인하세요. 매물 호가가 아닙니다.`;
  /* 항목 42 — 같은 단지를 렌더하는 색인 가능 URL 이 둘(/complex/{id} 와 이
     페이지)이라 서로 잠식했다. 사이트맵이 내는 /complex/{id} 를 정본으로
     선언한다. id 는 최근 거래 행의 실제 region_name 으로 조립 — 추측 없음.
     region_name 이 비어 있는 예외에는 기존 자기 canonical 을 유지한다. */
  const canonicalPath = latest.regionName
    ? `/complex/${encodeComplexId(latest.regionName, complexName)}`
    : `/complex/tx/${encodeURIComponent(complexName)}--${region.id}`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: seoAlternates(canonicalPath),
    openGraph: {
      title,
      description,
      siteName: "누구집",
      locale: "ko_KR",
      type: "website",
    },
  };
}

/* ---------- 페이지 ---------- */

export default async function ComplexTxPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadPageData(slug);
  if (!data) notFound();
  const { complexName, region, transactions } = data;

  const aptMatch = await findApartmentComplexByName(complexName, region).catch(() => null);
  const publicRecords = await getPublicRecordsForComplex(complexName, 40).catch(
    () => [],
  );
  const quoteRecords = publicRecords.filter(
    (r) => r.dataset === "kb_price_quote" && (r.priceLowKrw || r.priceHighKrw),
  );

  const latest = transactions[0];
  const address =
    transactions.find((t) => t.address)?.address ?? aptMatch?.address ?? null;
  const buildYear = transactions.find((t) => t.buildYear !== null)?.buildYear ?? null;
  const regionLabel = regionDisplayName(region);

  const bands = summarizeAreaBands(transactions);
  const monthly = summarizeMonthly(transactions);
  const maxMonthlyCount = Math.max(1, ...monthly.map((m) => m.count));
  const count12m = monthly.reduce((s, m) => s + m.count, 0);

  const overviewRows: Array<{ label: string; value: string }> = [
    { label: "지역", value: regionLabel },
    ...(address ? [{ label: "주소", value: address }] : []),
    ...(buildYear ? [{ label: "건축년도", value: `${buildYear}년` }] : []),
    { label: "최근 12개월 거래", value: `${count12m}건` },
    {
      label: "최근 실거래",
      value: `${formatKrwShort(latest.dealAmountKrw)} (${formatYmd(latest.contractYm, latest.contractDay)})`,
    },
  ];

  return (
    <PageShell
      breadcrumb={`홈 › 단지 실거래 › ${regionLabel} › ${complexName}`}
      title={`${complexName} 실거래가`}
    >
      <p className="rise-in mb-5 t-body text-text-2">
        국토교통부 실거래가 기반 · 매물 호가 아님 · 최근 거래{" "}
        <strong className="text-ink">{formatKrwShort(latest.dealAmountKrw)}</strong> (
        {formatYmd(latest.contractYm, latest.contractDay)})
      </p>

      {/* 실매물 연결 — 집주인 직접·중개사 등록 (검수 통과분만) */}
      <p className="rise-in mb-5 -mt-3 t-body">
        <Link
          href={`/listings?complex=${encodeURIComponent(complexName)}`}
          className="font-bold text-primary underline"
        >
          이 단지 매물 보기 →
        </Link>
      </p>

      {/* 단지 개요 */}
      <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
        <h2 className="t-section text-ink">단지 개요</h2>
        <div className="mt-2">
          {overviewRows.map((r) => (
            <div
              key={r.label}
              className="flex items-baseline justify-between gap-3 border-b border-border py-2 t-body last:border-b-0"
            >
              <span className="shrink-0 text-text-3">{r.label}</span>
              <span className="text-right font-bold text-ink">{r.value}</span>
            </div>
          ))}
        </div>
        {aptMatch && (
          <p className="mt-2 t-sub text-text-3">
            단지 정보: 공동주택 단지 데이터({aptMatch.name}) 병합
          </p>
        )}
      </section>

      {/* 면적대별 요약 */}
      {bands.length > 0 && (
        <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
          <h2 className="t-section text-ink">
            면적대별 시세{" "}
            <span className="t-sub font-medium text-text-3">
              최근 {transactions.length}건 기준
            </span>
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left t-body">
              <thead>
                <tr className="border-b border-border t-sub text-text-3">
                  <th className="py-2 font-medium">전용면적</th>
                  <th className="py-2 font-medium">거래</th>
                  <th className="py-2 text-right font-medium">최근가</th>
                  <th className="py-2 text-right font-medium">평균가</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.label} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 font-bold text-ink">{b.label}</td>
                    <td className="py-2.5 text-text-2">{b.count}건</td>
                    <td className="py-2.5 text-right font-extrabold text-ink">
                      {formatKrwShort(b.latestAmountKrw)}
                      <span className="ml-1 t-sub font-medium text-text-3">
                        {shortYm(b.latestYm)}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-text-2">
                      {formatKrwShort(b.avgAmountKrw)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 12개월 월별 거래량·평균가 미니 차트 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="t-section text-ink">
          월별 거래{" "}
          <span className="t-sub font-medium text-text-3">최근 12개월 · 거래량·평균가</span>
        </h2>
        {count12m === 0 ? (
          <p className="py-6 text-center t-body text-text-3">
            최근 12개월 거래가 없습니다. 아래 전체 이력에서 과거 거래를 확인하세요.
          </p>
        ) : (
          <>
            <div className="mt-4 flex h-[110px] items-end gap-[6px]">
              {monthly.map((m) => (
                <div
                  key={m.ym}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  title={`${formatYm(m.ym)} · ${m.count}건${
                    m.avgAmountKrw !== null ? ` · 평균 ${formatKrwShort(m.avgAmountKrw)}` : ""
                  }`}
                >
                  <span className="t-caption font-bold text-text-3">
                    {m.avgAmountKrw !== null ? formatKrwShort(m.avgAmountKrw) : ""}
                  </span>
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${m.count > 0 ? 12 + Math.round((m.count / maxMonthlyCount) * 84) : 3}px`,
                      background: m.count > 0 ? "var(--primary)" : "var(--border)",
                      opacity: m.count > 0 ? 0.55 + 0.45 * (m.count / maxMonthlyCount) : 1,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between t-caption text-text-3">
              <span>{shortYm(monthly[0].ym)}</span>
              <span>{shortYm(monthly[monthly.length - 1].ym)}</span>
            </div>
          </>
        )}
      </section>

      {/* 최근 거래 30건 표 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="t-section text-ink">
          거래 이력{" "}
          <span className="t-sub font-medium text-text-3">
            최근 {transactions.length}건 · 국토부 실거래가
          </span>
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left t-body">
            <thead>
              <tr className="border-b border-border t-sub text-text-3">
                <th className="py-2 font-medium">계약일</th>
                <th className="py-2 font-medium">전용면적</th>
                <th className="py-2 font-medium">층</th>
                <th className="py-2 text-right font-medium">거래금액</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr
                  key={`${t.contractYm}-${t.contractDay ?? 0}-${t.areaM2 ?? 0}-${i}`}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="py-2.5 text-text-2">
                    {formatYmd(t.contractYm, t.contractDay)}
                  </td>
                  <td className="py-2.5 text-text-2">
                    {t.areaM2 !== null ? `${t.areaM2.toFixed(1)}㎡` : "—"}
                  </td>
                  <td className="py-2.5 text-text-2">
                    {t.floor !== null ? `${t.floor}층` : "—"}
                  </td>
                  <td className="py-2.5 text-right font-extrabold text-ink">
                    {formatKrwShort(t.dealAmountKrw)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 t-sub text-text-3">
          국토교통부 실거래가 공개시스템 신고 자료 기반이며, 실제 매물 호가와 다를 수 있습니다.
        </p>
      </section>

      {/* 거주민 후기 — 단지명+지역 기준 키 (apartment_complexes 매칭 시 그 id 공유) */}
      <section className="rise-in-3 mb-6">
        <ComplexReviews
          complexId={aptMatch?.id ? `apt:${aptMatch.id}` : `tx:${region.id}:${complexName}`}
          complexName={complexName}
        />
      </section>

      {/* KB 시세정보 (CODEF 연동 시 노출) */}
      {quoteRecords.length > 0 && (
        <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
          <h2 className="t-section text-ink">
            KB 시세{" "}
            <span className="t-sub font-medium text-text-3">
              면적별 매매 상·하한 평균가 · 만원 아님(원 환산 표기)
            </span>
          </h2>
          <ul className="mt-2">
            {quoteRecords.slice(0, 8).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="t-body font-bold text-ink">
                    {r.areaM2 ? `${r.areaM2}㎡` : "면적 미상"}
                  </div>
                  <div className="mt-0.5 t-sub text-text-3">
                    {r.recordDate ?? r.period ?? ""} 기준
                  </div>
                </div>
                <div className="shrink-0 text-right t-body font-extrabold text-ink">
                  {r.priceLowKrw ? formatKrwShort(r.priceLowKrw) : "—"}
                  {" ~ "}
                  {r.priceHighKrw ? formatKrwShort(r.priceHighKrw) : "—"}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 t-sub text-text-3">
            출처: KB부동산 시세(공개 자료) · 참고용, 실거래·계약 조건에 따라 다를 수 있습니다.
          </p>
        </section>
      )}

      {/* CTA */}
      <section className="rise-in-3 mb-4 flex flex-wrap gap-2">
        <Link
          href="/notes/new"
          className="rounded-xl bg-primary px-5 py-3 t-body font-bold text-white shadow-[var(--shadow-cta)]"
        >
          이 단지 임장노트 쓰기
        </Link>
        <Link
          href={`/region/${region.id}`}
          className="card tile px-5 py-3 t-body font-bold text-ink"
        >
          {region.name} 지역 허브
        </Link>
        <Link href="/map" className="card tile px-5 py-3 t-body font-bold text-ink">
          지도에서 보기
        </Link>
        <Link
          href={`/complex/browse?district=${encodeURIComponent(regionLabel)}`}
          className="card tile px-5 py-3 t-body font-bold text-ink"
        >
          {region.name} 다른 단지
        </Link>
      </section>
    </PageShell>
  );
}
