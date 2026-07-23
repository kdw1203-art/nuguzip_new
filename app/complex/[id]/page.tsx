import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import {
  getComplexById,
  getTransactionHistory,
  getComplexPosts,
  searchComplexes,
  type ComplexRow,
  type ComplexTransactionRow,
} from "@/lib/complex/complex-store";
import {
  ComplexHubTabs,
  CompareTrayButton,
  type HubTrade,
  type HubNote,
  type HubListing,
} from "./hub-client";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { RecentComplexRecorder } from "../../components/RecentComplexes";
import { ComplexReviews } from "../ComplexReviews";
import {
  SEOUL_BROWSE_REGIONS,
  buildComplexTxSlug,
  listComplexTransactions,
} from "@/lib/market/complex-transactions";
import {
  complexResidenceJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
} from "@/lib/seo/jsonld";
import { JsonLd } from "@/app/components/JsonLd";
import { RoadviewButton } from "@/components/map/RoadviewButton";

/** undefined 값을 가진 키를 제거한다(JSON-LD 직렬화 전 정리용). */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, val]) => val !== undefined),
  ) as T;
}

/* ============================================================
   단지 허브 (연동 중심축 화면, SEO 핵심 랜딩 겸용)
   실데이터: complexes(getComplexById) + complex_transactions(getTransactionHistory)
   + posts(getComplexPosts). 존재하지 않는 단지 → notFound() (사실 우선: 목업 금지).
   비로그인 열람 허용 — index 대상.
   ============================================================ */

// ISR(운영 P0): searchParams 미사용 — 경로별 2분 재검증 캐시 (SEO 랜딩 성능)
export const revalidate = 120;

interface HubView {
  id: string;
  name: string;
  dong: string;
  followerLabel: string;
  metric: {
    price: string;
    priceSub: string;
    priceSubClass: string;
    listings: string;
    listingsSub: string;
    notes: string;
    notesSub: string;
    safety: string;
  };
  aiTitle: string;
  aiBody: string;
  myRecord: string;
  listingsLabel: string;
  infoRows: { label: string; value: string }[];
  trades: HubTrade[];
  notes: HubNote[];
  listings: HubListing[];
  /** 내부 링크 그물(#34) — 같은 동 다른 단지 (0건이면 섹션 미표시) */
  nearby: { id: string; name: string; meta: string }[];
  /** 국토부 실거래 이력 상세(/complex/tx) — 동일 단지명 매칭 시에만 링크 */
  txHref: string | null;
  /** 지도 좌표 — 거리뷰·JSON-LD geo 용 (목업 폴백은 없음 → 거리뷰 자동 숨김) */
  lat?: number | null;
  lng?: number | null;
}

/* ===== 실데이터 변환 (map/page.tsx 방식) ===== */

function formatManwon(manwon: number): string {
  if (!Number.isFinite(manwon) || manwon <= 0) return "—";
  if (manwon >= 10_000) return `${(manwon / 10_000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

function pctDelta(curr: number, prev: number | undefined): number | null {
  if (!prev || prev <= 0 || !Number.isFinite(curr)) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function deltaLabel(pct: number | null): { delta: string; tone: "up" | "down" | "flat" } {
  if (pct === null || pct === 0) return { delta: "—", tone: "flat" };
  return pct > 0
    ? { delta: `▲ ${Math.abs(pct).toFixed(1)}%`, tone: "up" }
    : { delta: `▼ ${Math.abs(pct).toFixed(1)}%`, tone: "down" };
}

function toTrades(tx: ComplexTransactionRow[]): HubTrade[] {
  // getTransactionHistory 는 과거→최신 순 반환 — 최신순으로 뒤집기
  const items: HubTrade[] = [];
  for (let i = tx.length - 1; i >= 0; i--) {
    const row = tx[i];
    const prev = i > 0 ? tx[i - 1].avg_manwon : undefined;
    const { delta, tone } = deltaLabel(pctDelta(row.avg_manwon, prev));
    items.push({
      date: `${row.yyyymm.slice(0, 4)}.${row.yyyymm.slice(4, 6)}`,
      price: formatManwon(row.avg_manwon),
      sub: `${row.deal_count}건`,
      delta,
      tone,
    });
  }
  return items;
}

interface ComplexPostRow {
  id: string;
  title: string;
  created_at: string;
  district: string | null;
  city: string | null;
  like_count: number | null;
  comment_count: number | null;
  view_count: number | null;
}

/* 내부 링크 그물(#34): 같은 동(district) 단지 조회 → 카드 데이터 */
function toNearby(rows: ComplexRow[], selfId: string): HubView["nearby"] {
  return rows
    .filter((c) => c.id !== selfId)
    .slice(0, 4)
    .map((c) => {
      const parts: string[] = [];
      if (c.build_year) parts.push(`${c.build_year}년`);
      if (c.households) parts.push(`${c.households.toLocaleString("ko-KR")}세대`);
      return {
        id: c.id,
        name: c.name,
        meta: parts.length > 0 ? parts.join(" · ") : `${c.city} ${c.district}`.trim(),
      };
    });
}

/** 서울 단지 — 동일 단지명 국토부 실거래 이력이 있으면 /complex/tx 링크 생성 */
async function resolveTxHref(row: ComplexRow): Promise<string | null> {
  if (!row.city?.startsWith("서울")) return null;
  const region = SEOUL_BROWSE_REGIONS.find((r) => r.name === row.district?.trim());
  if (!region) return null;
  try {
    const tx = await listComplexTransactions(row.name, region, 1);
    if (tx.length === 0) return null;
    return `/complex/tx/${buildComplexTxSlug(row.name, region.id)}`;
  } catch {
    return null;
  }
}

function toView(
  row: ComplexRow,
  tx: ComplexTransactionRow[],
  posts: ComplexPostRow[],
  nearby: HubView["nearby"],
  txHref: string | null,
): HubView {
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  const prev = tx.length > 1 ? tx[tx.length - 2] : null;
  const { delta, tone } = deltaLabel(latest ? pctDelta(latest.avg_manwon, prev?.avg_manwon) : null);
  const dong = row.district || row.city || "지역";
  // 사실 우선: 실거래 데이터가 없으면 목업 대신 빈 배열(클라이언트가 안내 문구 표시)
  const trades = tx.length > 0 ? toTrades(tx) : [];
  const notes: HubNote[] =
    posts.length > 0
      ? posts.slice(0, 6).map((p) => ({
          title: p.title,
          author: `${p.district ?? dong} · ${p.created_at.slice(5, 10).replace("-", ".")}`,
          score: `공감 ${p.like_count ?? 0}`,
        }))
      : [];

  const infoRows: { label: string; value: string }[] = [];
  if (row.build_year) infoRows.push({ label: "준공", value: `${row.build_year}년` });
  if (row.households)
    infoRows.push({ label: "세대수", value: `${row.households.toLocaleString("ko-KR")}세대` });
  if (row.builder_name) infoRows.push({ label: "시공사", value: row.builder_name });
  infoRows.push({
    label: "주소",
    value: row.road_address || row.address || `${row.city} ${row.district}`.trim(),
  });

  return {
    id: row.id,
    name: row.name,
    dong,
    followerLabel: "+ 단지 팔로우",
    metric: {
      price: latest ? formatManwon(latest.avg_manwon) : "시세 준비 중",
      priceSub: latest ? `${delta} 전월비` : "실거래 수집 중",
      priceSubClass:
        tone === "down" ? "delta-down" : tone === "up" ? "delta-up" : "text-text-3",
      // 사실 기반: 실매물 소스 미연동 — 허위 수치 대신 "—"
      listings: "매물 —",
      listingsSub: "등록 대기",
      notes: `노트 ${posts.length.toLocaleString("ko-KR")}`,
      notesSub: posts.length > 0 ? "단지 이야기 포함" : "첫 노트를 남겨보세요",
      // 안전등급 산정 미연동 — 허위 등급 금지
      safety: "—",
    },
    aiTitle: `AI 요약 · ${row.name}`,
    aiBody: latest
      ? `최근 실거래 평균 ${formatManwon(latest.avg_manwon)} (${delta} 전월비) — 국토교통부 실거래가 기준. 현장 확인 후 판단하세요.`
      : "실거래·후기가 쌓이면 AI 요약을 제공합니다.",
    myRecord: "로그인하면 이 단지에 남긴 임장노트를 볼 수 있어요",
    listingsLabel: "실매물 준비 중",
    infoRows,
    trades,
    notes,
    // 실매물 소스 미연동: 허위 매물 대신 빈 배열
    listings: [],
    nearby,
    txHref,
    lat: row.lat,
    lng: row.lng,
  };
}

async function loadView(id: string): Promise<HubView | null> {
  // 사실 우선: 존재하지 않는 단지는 목업 대신 null → notFound()
  const row = await getComplexById(id);
  if (!row) return null;
  const [tx, posts, sameDong, txHref] = await Promise.all([
    getTransactionHistory(row.id, 6).catch(() => [] as ComplexTransactionRow[]),
    getComplexPosts(row.id, 6).catch(() => []) as Promise<ComplexPostRow[]>,
    // #34: 같은 동(district) 다른 단지 — 자기 자신 제외분 확보 위해 5건 조회
    row.district
      ? searchComplexes("", row.district, 5).catch(() => [] as ComplexRow[])
      : Promise.resolve([] as ComplexRow[]),
    resolveTxHref(row),
  ]);
  return toView(row, tx, posts, toNearby(sameDong, row.id), txHref);
}

/* ===== SEO — 단지명 title/description, 비로그인 열람 허용 (index 대상) ===== */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // 사실 우선: 존재하지 않는 단지는 목업 메타 대신 noindex 안내
  let row: ComplexRow | null = null;
  try {
    row = await getComplexById(id);
  } catch {
    row = null;
  }
  if (!row) {
    return {
      title: "단지를 찾을 수 없습니다 | 누구집",
      description: "요청하신 단지 정보를 찾을 수 없습니다.",
      robots: { index: false, follow: false },
    };
  }

  const name = row.name;
  const region = `${row.city} ${row.district}`.trim() || "지역";
  let price = "시세 준비 중";
  let delta = "";
  const tx = await getTransactionHistory(row.id, 2).catch(
    () => [] as ComplexTransactionRow[],
  );
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  const prev = tx.length > 1 ? tx[tx.length - 2] : null;
  if (latest) {
    price = formatManwon(latest.avg_manwon);
    const d = deltaLabel(pctDelta(latest.avg_manwon, prev?.avg_manwon));
    delta = d.tone === "flat" ? "" : `${d.delta} 전월비`;
  }

  const title = `${name} 시세·매물·임장노트 | 누구집`;
  const description = `${region} ${name} 단지 홈 — 실거래 시세, 매물, 이웃 임장노트, 안전 진단을 한 화면에서 확인하세요.`;
  // 동적 OG 이미지 — 실데이터 값 URL 인코딩 (metadataBase 기준 절대화)
  const ogQuery = new URLSearchParams({ name, price, region });
  if (delta) ogQuery.set("delta", delta);

  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      siteName: "누구집",
      locale: "ko_KR",
      type: "website",
      images: [
        {
          url: `/api/og/complex?${ogQuery.toString()}`,
          width: 1200,
          height: 630,
          alt: `${name} 시세 카드`,
        },
      ],
    },
  };
}

export default async function ComplexHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const complexId = decodeURIComponent(id);
  const v = await loadView(complexId);
  // 사실 우선: 존재하지 않는 단지는 목업 대신 404
  if (!v) notFound();
  // 데이터 신선도 라벨(#21) — 조회 실패 시 null → 캡션 미표시
  const freshness = await getMarketFreshnessDateLabel();

  // JSON-LD(Residence/Place + Breadcrumb) — 실단지이므로 항상 생성
  const isRealComplex = true;
  const complexAddress = v.infoRows.find((r) => r.label === "주소")?.value ?? null;
  const complexPriceRange =
    v.metric.price && !/준비|수집/.test(v.metric.price) ? v.metric.price : null;
  const complexJsonLd = isRealComplex
    ? [
        complexResidenceJsonLd({
          id: complexId,
          name: v.name,
          address: complexAddress,
          regionName: v.dong,
          priceRange: complexPriceRange,
        }),
        breadcrumbJsonLd([
          { name: "홈", url: "/" },
          { name: v.dong },
          { name: v.name, url: `/complex/${encodeURIComponent(complexId)}` },
        ]),
      ]
    : null;

  // JSON-LD(항목 H37) — Residence 구조화 데이터. 이미 가진 페이지 데이터만 사용.
  const residenceAddress = pruneUndefined({
    "@type": "PostalAddress",
    addressLocality: v.dong || undefined,
    streetAddress: complexAddress || undefined,
  });
  const residenceGeo =
    typeof v.lat === "number" &&
    Number.isFinite(v.lat) &&
    typeof v.lng === "number" &&
    Number.isFinite(v.lng)
      ? { "@type": "GeoCoordinates", latitude: v.lat, longitude: v.lng }
      : undefined;
  const residenceJsonLd = pruneUndefined({
    "@context": "https://schema.org",
    "@type": "Residence",
    name: v.name,
    address: Object.keys(residenceAddress).length > 1 ? residenceAddress : undefined,
    geo: residenceGeo,
  });

  const cta = (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {/* 연결성: 단지명·지역·단지ID·좌표 프리필로 임장노트 작성 진입 */}
        <Link
          href={(() => {
            const params = new URLSearchParams({ apt: v.name });
            if (v.dong) params.set("region", v.dong);
            if (complexId) params.set("complexId", complexId);
            if (typeof v.lat === "number" && typeof v.lng === "number") {
              params.set("lat", String(v.lat));
              params.set("lng", String(v.lng));
            }
            return `/notes/new?${params.toString()}`;
          })()}
          className="btn-primary btn-cta flex-1 rounded-[11px] p-3 text-center text-[13px]"
        >
          이 단지 임장노트 쓰기
        </Link>
        <CompareTrayButton complexId={complexId} name={v.name} region={v.dong} />
      </div>
      <Link href="/map" className="btn-soft rounded-[11px] p-2.5 text-center text-xs">
        지도에서 보기 ›
      </Link>
    </div>
  );

  return (
    <PageShell>
      {/* JSON-LD(Residence/Place + Breadcrumb) — 실단지 SEO 구조화 데이터 */}
      {complexJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(complexJsonLd) }}
        />
      )}

      {/* JSON-LD(항목 H37) — Residence 구조화 데이터 */}
      <JsonLd data={residenceJsonLd} />

      {/* 최근 본 단지 기록 (localStorage nz_recent_complexes · 목업 폴백은 미기록) */}
      <RecentComplexRecorder id={v.id} name={v.name} region={v.dong} />

      {/* 브레드크럼 칩 — ‹ 지도 · 동 · 단지명 */}
      <div className="rise-in flex flex-wrap gap-1.5">
        <Link
          href="/map"
          className="chip border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-text-2"
        >
          ‹ 지도
        </Link>
        <span className="chip border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-text-2">
          {v.dong}
        </span>
        <span className="chip bg-ink px-2.5 py-1 text-[11px] font-extrabold text-white">
          {v.name}
        </span>
      </div>

      {/* 단지명 + 팔로우 */}
      <div className="rise-in mt-3 flex items-baseline justify-between">
        <h1 className="text-[22px] font-extrabold text-ink md:text-[26px]">{v.name}</h1>
        <button type="button" className="text-xs font-bold text-primary">
          {v.followerLabel}
        </button>
      </div>

      {/* 거리뷰(항목 A5) — 좌표가 유한할 때만 (목업 폴백은 좌표 없음 → 자동 숨김) */}
      {typeof v.lat === "number" && typeof v.lng === "number" && (
        <div className="rise-in mt-2">
          <RoadviewButton lat={v.lat} lng={v.lng} label={v.name} />
        </div>
      )}

      {/* 지표 4카드 — 시세·매물·노트 수·안전 등급 */}
      <div className="rise-in-1 mt-3 grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <div className="card rounded-xl px-3 py-[11px] text-center">
          <div className="text-base font-extrabold text-ink">{v.metric.price}</div>
          <div className={`mt-0.5 text-[11px] font-bold ${v.metric.priceSubClass}`}>
            {v.metric.priceSub}
          </div>
        </div>
        <div className="card rounded-xl px-3 py-[11px] text-center">
          <div className="text-base font-extrabold text-ink">{v.metric.listings}</div>
          <div className="mt-0.5 text-[11px] text-text-3">{v.metric.listingsSub}</div>
        </div>
        <div className="card rounded-xl px-3 py-[11px] text-center">
          <div className="text-base font-extrabold text-ink">{v.metric.notes}</div>
          <div className="mt-0.5 text-[11px] text-text-3">{v.metric.notesSub}</div>
        </div>
        <div className="card rounded-xl px-3 py-[11px] text-center">
          <div className="text-base font-extrabold text-[#1a7f4e]">{v.metric.safety}</div>
          <div className="mt-0.5 text-[11px] text-text-3">안전 진단</div>
        </div>
      </div>

      {/* 국토부 실거래 이력 상세 — 동일 단지명 매칭 시에만 노출 */}
      {v.txHref && (
        <div className="rise-in-1 mt-3">
          <Link
            href={v.txHref}
            className="card card-hover flex items-center justify-between rounded-xl px-4 py-3"
          >
            <span className="text-[13px] font-bold text-ink">
              {v.name} 국토부 실거래 이력 보기
              <span className="ml-2 text-[11px] font-medium text-text-3">
                실거래가 기반 · 매물 호가 아님
              </span>
            </span>
            <span className="text-[13px] font-bold text-primary">→</span>
          </Link>
        </div>
      )}

      {/* 데이터 신선도 캡션(#21) — market_ingest_log 최근 성공 기준 */}
      {freshness && (
        <p className="t-caption rise-in-1 mt-1.5 text-text-3">
          실거래 기준: {freshness} (국토교통부)
        </p>
      )}

      {/* 본문 — 모바일 1열(시안), 데스크탑 2열 확장 */}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        <ComplexHubTabs
          aiTitle={v.aiTitle}
          aiBody={v.aiBody}
          myRecord={v.myRecord}
          listingsLabel={v.listingsLabel}
          trades={v.trades}
          notes={v.notes}
          listings={v.listings}
        />

        {/* 데스크탑 우측 컬럼 */}
        <aside className="hidden flex-col gap-3.5 lg:flex">
          <div className="rise-in-2 card flex flex-col gap-1 rounded-[18px] px-[18px] py-4">
            <div className="mb-1 text-[13px] font-extrabold text-ink">단지 정보</div>
            {v.infoRows.map((r) => (
              <div
                key={r.label}
                className="flex items-baseline justify-between gap-3 py-[5px] text-xs"
              >
                <span className="shrink-0 text-text-3">{r.label}</span>
                <span className="text-right font-bold text-ink">{r.value}</span>
              </div>
            ))}
          </div>
          <div className="rise-in-3">{cta}</div>
          <div className="rise-in-4 card flex h-[92px] items-center justify-center rounded-[18px] text-xs text-text-3">
            <span className="mr-1.5 rounded bg-[#f2f4f8] px-1.5 py-px font-mono text-[9px] font-bold">
              AD
            </span>
            이 지역 추천 서비스
          </div>
        </aside>
      </div>

      {/* 내부 링크 그물(#34) — 같은 동 다른 단지 (0건이면 미표시) */}
      {v.nearby.length > 0 && (
        <section className="rise-in-5 mt-6">
          <h2 className="mb-2 px-1 text-[15px] font-extrabold text-ink">
            {v.dong} 다른 단지
          </h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {v.nearby.map((n) => (
              <Link
                key={n.id}
                href={`/complex/${encodeURIComponent(n.id)}`}
                className="card card-hover rounded-2xl px-4 py-3.5"
              >
                <div className="truncate text-[13px] font-extrabold text-ink">
                  {n.name}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-text-3">{n.meta}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 거주민 후기 (호갱노노 벤치마크) — 실단지 매칭 시에만 (목업 폴백엔 미표시) */}
      {v.id === complexId && complexId !== "mock-1" && (
        <section className="rise-in-5 mt-6">
          <ComplexReviews complexId={complexId} complexName={v.name} />
        </section>
      )}

      {/* 모바일 CTA 2개 (시안 하단) */}
      <div className="rise-in-4 mt-4 lg:hidden">{cta}</div>
    </PageShell>
  );
}
