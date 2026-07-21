import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import {
  getRegionSnapshot,
  getRegionSeries,
  listRegionTransactions,
  type RegionTransactionRow,
} from "@/lib/market/store";
import type { RegionMarketSnapshot } from "@/lib/market/types";
import { listPublicNotes } from "@/lib/inspection/store-db";
import { getSupplyForArea, type SupplyItem } from "@/lib/market/supply";
import type { InspectionNote } from "@/lib/inspection/store-db";
import {
  findComplexTxRegionById,
  listDistrictComplexSummaries,
  type ComplexSummary,
  type ComplexTxRegion,
} from "@/lib/market/complex-transactions";
import { ComplexSummaryTable } from "../../components/ComplexSummaryTable";
import {
  breadcrumbJsonLd,
  regionPlaceJsonLd,
  jsonLdScript,
} from "@/lib/seo/jsonld";
import { JsonLd } from "@/app/components/JsonLd";

/* ============================================================
   지역 허브 SEO 페이지 — /region/[id]
   market_region_price 61개 지역 스냅샷 기반. 비로그인 열람 허용(index 대상).
   ISR 1시간 재검증 · generateStaticParams 생략(동적+ISR).
   ============================================================ */

export const revalidate = 3600;

/* ---------- 포맷 헬퍼 ---------- */

/** 원(KRW) → "12.4억" / "9,800만" */
function formatKrwShort(krw: number | undefined): string {
  if (krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

/** "202606" → "2026.06" */
function formatYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

/** "2025-08-01" → "25.08" */
function shortPeriod(period: string): string {
  return period.length >= 7 ? `${period.slice(2, 4)}.${period.slice(5, 7)}` : period;
}

function deltaView(changePct: number | undefined): {
  label: string;
  className: string;
} {
  if (changePct === undefined || !Number.isFinite(changePct)) {
    return { label: "—", className: "delta-flat" };
  }
  const abs = Math.abs(changePct).toFixed(2);
  // 시세 관례: 상승 red(delta-up) / 하락 blue(delta-down)
  if (changePct > 0) return { label: `▲ ${abs}%`, className: "delta-up" };
  if (changePct < 0) return { label: `▼ ${abs}%`, className: "delta-down" };
  return { label: "0.00%", className: "delta-flat" };
}

/** 공개 임장노트 지역 텍스트 매칭 — "고양시 덕양구" ↔ "고양 덕양구 행신동" 등 */
function noteMatchesRegion(noteRegion: string, regionName: string): boolean {
  const target = noteRegion.replace(/\s+/g, "");
  if (!target) return false;
  const full = regionName.replace(/\s+/g, "");
  if (target.includes(full) || full.includes(target)) return true;
  const lastToken = regionName.trim().split(/\s+/).pop() ?? "";
  return lastToken.length >= 2 && target.includes(lastToken);
}

/* ---------- 메타데이터 ---------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const snapshot = await getRegionSnapshot(id).catch(() => null);
  if (!snapshot) {
    return { title: "지역 시세 | 누구집", robots: { index: false, follow: false } };
  }
  const name = snapshot.regionName;
  const price =
    snapshot.avgSale !== undefined ? `평균 매매가 ${formatKrwShort(snapshot.avgSale)}` : "시세 준비 중";
  const title = `${name} 아파트 시세·실거래 | 누구집`;
  const description = `${name} 아파트 ${price} (${formatYm(snapshot.period)} 기준) — 매매·전세 시세 추이, 최근 실거래, 이웃 임장노트를 한 화면에서 확인하세요.`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: `https://nuguzip.com/region/${id}` },
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

export default async function RegionHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ complexes?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const snapshot: RegionMarketSnapshot | null = await getRegionSnapshot(id).catch(
    () => null,
  );
  if (!snapshot) notFound();

  const name = snapshot.regionName;
  // 단지별 현황 — 기본 12개, ?complexes=30 으로 확장
  const complexLimit = sp.complexes === "30" ? 30 : 12;
  const txRegion: ComplexTxRegion =
    findComplexTxRegionById(id) ?? { id, name, city: id.startsWith("incheon-") ? "인천" : "서울" };
  const [series, transactions, complexSummaries, allNotes] = await Promise.all([
    getRegionSeries(id, "sale_index", "monthly", 12).catch(
      () => [] as Array<{ period: string; value: number }>,
    ),
    listRegionTransactions(id, name, 5).catch(() => [] as RegionTransactionRow[]),
    listDistrictComplexSummaries(txRegion, complexLimit).catch(
      () => [] as ComplexSummary[],
    ),
    listPublicNotes(100).catch(() => [] as InspectionNote[]),
  ]);
  // 이 지역 자치구명으로 입주 예정 물량 매칭 (예: "강남구")
  const supplyArea = name.trim().split(/\s+/).pop() ?? name;
  const supply: SupplyItem[] = await getSupplyForArea(supplyArea, 6).catch(
    () => [],
  );
  const notes = allNotes
    .filter((n) => n.isPublic && noteMatchesRegion(n.region ?? "", name))
    .slice(0, 4);

  const delta = deltaView(snapshot.saleChangeMonthly);
  const jeonseRatio =
    snapshot.jeonseRatio !== undefined && Number.isFinite(snapshot.jeonseRatio)
      ? `${snapshot.jeonseRatio.toFixed(1)}%`
      : "—";

  // 스파크라인(막대) 정규화 — 차트 라이브러리 없이 CSS 바
  const values = series.map((s) => s.value);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const range = max - min;
  const barHeight = (v: number): number =>
    range > 0 ? 24 + Math.round(((v - min) / range) * 76) : 60;

  const kpiCards: Array<{ label: string; value: string; sub?: string; subClass?: string }> = [
    { label: "평균 매매가", value: formatKrwShort(snapshot.avgSale) },
    { label: "중위 매매가", value: formatKrwShort(snapshot.medianSale) },
    { label: "전월 대비", value: delta.label, subClass: delta.className },
    { label: "전세가율", value: jeonseRatio },
  ];

  // JSON-LD(BreadcrumbList + Place) — 실데이터 스냅샷, 존재 필드만
  const regionJsonLd = [
    breadcrumbJsonLd([
      { name: "홈", url: "/" },
      { name: "지역 시세" },
      { name, url: `/region/${id}` },
    ]),
    regionPlaceJsonLd({
      id,
      name,
      description:
        snapshot.avgSale !== undefined
          ? `${name} 아파트 평균 매매가 ${formatKrwShort(snapshot.avgSale)} (${formatYm(
              snapshot.period,
            )} 기준)`
          : null,
    }),
  ];

  // 항목 H37 — 공유 JsonLd 헬퍼용 Place (지역명 + 시/도 addressRegion). 실데이터만.
  const placeJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Place",
    name,
    address: {
      "@type": "PostalAddress",
      addressRegion: txRegion.city || name,
    },
  };

  return (
    <PageShell
      breadcrumb={`홈 › 지역 시세 › ${name}`}
      title={`${name} 아파트 시세`}
    >
      {/* JSON-LD(BreadcrumbList + Place) — 지역 SEO 구조화 데이터 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(regionJsonLd) }}
      />
      {/* 항목 H37 — 공유 JsonLd 헬퍼로 Place 구조화 데이터 삽입 (additive) */}
      <JsonLd data={placeJsonLd} />
      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        {formatYm(snapshot.period)} 기준 · 출처{" "}
        {snapshot.source === "reb" ? "한국부동산원(R-ONE)" : snapshot.source === "kb" ? "KB부동산" : "자체 수집"}
      </p>

      {/* 현재가 KPI 4카드 */}
      <section className="rise-in-1 mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-[11px] text-text-3">{k.label}</div>
            <div
              className={`mt-1 text-[20px] font-extrabold ${
                k.subClass ?? "text-ink"
              }`}
            >
              {k.value}
            </div>
          </div>
        ))}
      </section>

      {/* 최근 시세 추이 — 매매가격지수 월간 12개월, CSS 바 스파크라인 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          최근 시세 추이{" "}
          <span className="text-[11px] font-medium text-text-3">
            매매가격지수 · 월간
          </span>
        </h2>
        {series.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">
            시세 추이 데이터를 준비 중입니다.
          </p>
        ) : (
          <>
            <div className="mt-4 flex h-[110px] items-end gap-[6px]">
              {series.map((s, i) => (
                <div
                  key={s.period}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  title={`${s.period} · ${s.value.toFixed(1)}`}
                >
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${barHeight(s.value)}px`,
                      background:
                        i === series.length - 1
                          ? "var(--primary)"
                          : "var(--primary-soft)",
                      border:
                        i === series.length - 1
                          ? "none"
                          : "1px solid var(--border)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-text-3">
              <span>{shortPeriod(series[0].period)}</span>
              <span>{shortPeriod(series[series.length - 1].period)}</span>
            </div>
          </>
        )}
      </section>

      {/* 최근 실거래 5건 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          최근 실거래{" "}
          <span className="text-[11px] font-medium text-text-3">
            아파트 매매 · 국토부 실거래가
          </span>
        </h2>
        {transactions.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">
            이 지역의 실거래 데이터를 준비 중입니다.
          </p>
        ) : (
          <ul className="mt-2">
            {transactions.map((t, i) => (
              <li
                key={`${t.complexName}-${t.contractYm}-${i}`}
                className={`flex items-center justify-between gap-3 py-3 ${
                  i < transactions.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-ink">
                    {t.complexName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-3">
                    {formatYm(t.contractYm)}
                    {t.contractDay ? `.${String(t.contractDay).padStart(2, "0")}` : ""}
                    {t.areaM2 !== null ? ` · ${t.areaM2.toFixed(1)}㎡` : ""}
                    {t.floor !== null ? ` · ${t.floor}층` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-[15px] font-extrabold text-ink">
                  {formatKrwShort(t.dealAmountKrw)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 단지별 현황 — market_transactions 그룹 요약 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-extrabold text-ink">
            단지별 현황{" "}
            <span className="text-[11px] font-medium text-text-3">
              국토부 실거래가 기반 · 매물 호가 아님
            </span>
          </h2>
          {complexSummaries.length > 0 && complexLimit === 12 && (
            <Link
              href={`/region/${id}?complexes=30`}
              className="shrink-0 text-[12px] font-bold text-primary"
            >
              더 보기
            </Link>
          )}
        </div>
        <ComplexSummaryTable summaries={complexSummaries} regionId={id} />
        {complexSummaries.length > 0 && (
          <div className="mt-3 text-right">
            <Link
              href={`/complex/browse?district=${encodeURIComponent(
                txRegion.city === "서울" ? `서울 ${txRegion.name}` : txRegion.name,
              )}`}
              className="text-[12px] font-bold text-primary"
            >
              서울 전체 단지 브라우즈 →
            </Link>
          </div>
        )}
      </section>

      {/* 이 지역 입주 예정 물량 */}
      {supply.length > 0 && (
        <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            {name} 입주 예정 물량{" "}
            <span className="text-[11px] font-medium text-text-3">
              공급 · 2026~2027
            </span>
          </h2>
          <ul className="mt-2">
            {supply.map((s, i) => (
              <li
                key={`${s.moveInYm}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-ink">
                    {s.aptName ?? "미정"}
                    {s.bizType ? (
                      <span className="ml-1.5 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {s.bizType}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-text-3">
                    {s.address ?? ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[13px] font-extrabold text-ink">
                    {s.moveInYm.slice(0, 4)}.{s.moveInYm.slice(4, 6)}
                  </div>
                  <div className="text-[11px] text-text-3">
                    {s.households ? `${s.households.toLocaleString()}세대` : "—"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href={`/supply?region=${encodeURIComponent(txRegion.city)}`}
            className="mt-3 inline-block text-[12px] font-bold text-primary"
          >
            {txRegion.city} 전체 입주 물량 ›
          </Link>
        </section>
      )}

      {/* 이 지역 공개 임장노트 */}
      <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          {name} 공개 임장노트
        </h2>
        {notes.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-3">
            아직 이 지역의 공개 임장노트가 없어요. 첫 노트를 남겨보세요.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {notes.map((n) => (
              <Link
                key={n.id}
                href={`/notes/${n.id}`}
                className="card card-hover block p-4"
              >
                <div className="truncate text-[13px] font-bold text-ink">
                  {n.title}
                </div>
                <div className="mt-1 text-[11px] text-text-3">
                  {n.region}
                  {n.aptName ? ` · ${n.aptName}` : ""} · {n.visitDate}
                </div>
                {n.summary ? (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-[1.6] text-text-2">
                    {n.summary}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="rise-in-3 mb-4 flex flex-wrap gap-2">
        <Link
          href="/notes/new"
          className="rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-[var(--shadow-cta)]"
        >
          이 지역 임장노트 쓰기
        </Link>
        <Link
          href="/map"
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          지도에서 보기
        </Link>
        <Link
          href="/notifications"
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          시세 알림 구독
        </Link>
      </section>
    </PageShell>
  );
}
