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
import { getPublicRecordsForComplex } from "@/lib/market/public-records";

/* ============================================================
   단지 실거래 상세 — /complex/tx/[slug]
   slug = encodeURIComponent(단지명) + "--" + regionId
   국토부 실거래가(market_transactions) 기반 — 매물 호가 아님.
   비로그인 열람 허용(index 대상) · ISR 1시간.
   ============================================================ */

export const revalidate = 3600;

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

async function loadPageData(slug: string): Promise<{
  complexName: string;
  region: NonNullable<ReturnType<typeof findComplexTxRegionById>>;
  transactions: ComplexTransactionRecord[];
} | null> {
  const parsed = parseComplexTxSlug(slug);
  if (!parsed) return null;
  const region = findComplexTxRegionById(parsed.regionId);
  if (!region) return null;
  const transactions = await listComplexTransactions(parsed.complexName, region, 30).catch(
    () => [] as ComplexTransactionRecord[],
  );
  if (transactions.length === 0) return null;
  return { complexName: parsed.complexName, region, transactions };
}

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
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: `https://nuguzip.com/complex/tx/${encodeURIComponent(complexName)}--${region.id}`,
    },
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
      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        국토교통부 실거래가 기반 · 매물 호가 아님 · 최근 거래{" "}
        <strong className="text-ink">{formatKrwShort(latest.dealAmountKrw)}</strong> (
        {formatYmd(latest.contractYm, latest.contractDay)})
      </p>

      {/* 실매물 연결 — 집주인 직접·중개사 등록 (검수 통과분만) */}
      <p className="rise-in mb-5 -mt-3 text-[13px]">
        <Link
          href={`/listings?complex=${encodeURIComponent(complexName)}`}
          className="font-bold text-primary underline"
        >
          이 단지 매물 보기 →
        </Link>
      </p>

      {/* 단지 개요 */}
      <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">단지 개요</h2>
        <div className="mt-2">
          {overviewRows.map((r) => (
            <div
              key={r.label}
              className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-[13px] last:border-b-0"
            >
              <span className="shrink-0 text-text-3">{r.label}</span>
              <span className="text-right font-bold text-ink">{r.value}</span>
            </div>
          ))}
        </div>
        {aptMatch && (
          <p className="mt-2 text-[11px] text-text-3">
            단지 정보: 공동주택 단지 데이터({aptMatch.name}) 병합
          </p>
        )}
      </section>

      {/* 면적대별 요약 */}
      {bands.length > 0 && (
        <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            면적대별 시세{" "}
            <span className="text-[11px] font-medium text-text-3">
              최근 {transactions.length}건 기준
            </span>
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] text-text-3">
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
                      <span className="ml-1 text-[11px] font-medium text-text-3">
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
        <h2 className="text-[15px] font-extrabold text-ink">
          월별 거래{" "}
          <span className="text-[11px] font-medium text-text-3">최근 12개월 · 거래량·평균가</span>
        </h2>
        {count12m === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">
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
                  <span className="text-[9px] font-bold text-text-3">
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
            <div className="mt-1 flex justify-between text-[9px] text-text-3">
              <span>{shortYm(monthly[0].ym)}</span>
              <span>{shortYm(monthly[monthly.length - 1].ym)}</span>
            </div>
          </>
        )}
      </section>

      {/* 최근 거래 30건 표 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          거래 이력{" "}
          <span className="text-[11px] font-medium text-text-3">
            최근 {transactions.length}건 · 국토부 실거래가
          </span>
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] text-text-3">
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
        <p className="mt-2 text-[11px] text-text-3">
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
          <h2 className="text-[15px] font-extrabold text-ink">
            KB 시세{" "}
            <span className="text-[11px] font-medium text-text-3">
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
                  <div className="text-[13px] font-bold text-ink">
                    {r.areaM2 ? `${r.areaM2}㎡` : "면적 미상"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-3">
                    {r.recordDate ?? r.period ?? ""} 기준
                  </div>
                </div>
                <div className="shrink-0 text-right text-[13px] font-extrabold text-ink">
                  {r.priceLowKrw ? formatKrwShort(r.priceLowKrw) : "—"}
                  {" ~ "}
                  {r.priceHighKrw ? formatKrwShort(r.priceHighKrw) : "—"}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-text-3">
            출처: KB부동산 시세(공개 자료) · 참고용, 실거래·계약 조건에 따라 다를 수 있습니다.
          </p>
        </section>
      )}

      {/* CTA */}
      <section className="rise-in-3 mb-4 flex flex-wrap gap-2">
        <Link
          href="/notes/new"
          className="rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-[var(--shadow-cta)]"
        >
          이 단지 임장노트 쓰기
        </Link>
        <Link
          href={`/region/${region.id}`}
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          {region.name} 지역 허브
        </Link>
        <Link href="/map" className="card card-hover px-5 py-3 text-[13px] font-bold text-ink">
          지도에서 보기
        </Link>
        <Link
          href={`/complex/browse?district=${encodeURIComponent(regionLabel)}`}
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          {region.name} 다른 단지
        </Link>
      </section>
    </PageShell>
  );
}
