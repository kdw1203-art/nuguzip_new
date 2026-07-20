import type { Metadata } from "next";
import Link from "next/link";
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

/* ============================================================
   시안 23b — 단지 허브 (연동 중심축 화면, SEO 핵심 랜딩 22f-65 겸용)
   실데이터: complexes(getComplexById) + complex_transactions(getTransactionHistory)
   + posts(getComplexPosts). 조회 실패/없음 시 시안 목업(공작아파트) 폴백.
   비로그인 열람 허용 — index 대상(20b).
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
}

/* ===== 목업 폴백 — 시안 23b 공작아파트 ===== */
const MOCK_LISTINGS: HubListing[] = [
  {
    badge: "급매",
    urgent: true,
    price: "매매 7.9억",
    priceNote: "시세 대비 -6%",
    meta: "84A · 5층/15층 · 남향 · 즉시입주 · 올수리",
    agent: "관양공인 · 오늘 등록",
  },
  {
    badge: "일반",
    urgent: false,
    price: "매매 8.4억",
    priceNote: null,
    meta: "84A · 12층/15층 · 남동향 · 협의 · 로얄층",
    agent: "평촌공인 · 3일 전",
  },
  {
    badge: "전세",
    urgent: false,
    price: "전세 4.9억",
    priceNote: "▼3,000",
    meta: "84B · 9층/15층 · 남서향 · 세안고",
    agent: "관양중앙공인 · 1주 전",
  },
];

const MOCK_TRADES: HubTrade[] = [
  { date: "2026.06", price: "8.15억", sub: "5층", delta: "▼ 1.8%", tone: "down" },
  { date: "2026.05", price: "8.3억", sub: "11층", delta: "▼ 0.6%", tone: "down" },
  { date: "2026.03", price: "8.75억", sub: "7층", delta: "▲ 0.9%", tone: "up" },
];

const MOCK_NOTES: HubNote[] = [
  { title: "공작 302동 — “주차가 관건, 저녁 실측”", author: "첫집준비중 · 07.12", score: "78점" },
  { title: "공작 105동 — “겨울 채광 확인함”", author: "관양토박이 · 07.15", score: "81점" },
];

const MOCK_VIEW: HubView = {
  id: "mock-1",
  name: "공작아파트",
  dong: "관양동",
  followerLabel: "+ 단지 팔로우 1.2k",
  metric: {
    price: "4.9억",
    priceSub: "전세 ▼3,000",
    priceSubClass: "text-[#1a7f4e]",
    listings: "매물 12",
    listingsSub: "전세 7 · 매매 5",
    notes: "노트 3,812",
    notesSub: "이번 주 +38",
    safety: "A",
  },
  aiTitle: "AI 요약 · 노트 3,812건",
  aiBody: "채광 상(87%) · 주차 하(74%) · 최근 “누수” 언급 3단지 저층 집중 (13c 재사용)",
  myRecord: "노트 3건 · 비교 후보 · 예상가 4.7억",
  listingsLabel: "매물 12 · 전세 7 · 매매 5",
  infoRows: [
    { label: "준공", value: "1988년" },
    { label: "세대수", value: "1,486세대" },
    { label: "용적률", value: "199%" },
    { label: "주소", value: "안양 동안구 관양동" },
  ],
  trades: MOCK_TRADES,
  notes: MOCK_NOTES,
  listings: MOCK_LISTINGS,
  nearby: [], // 목업 폴백 시 존재하지 않는 단지로 링크하지 않음
  txHref: null,
};

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
  const trades = tx.length > 0 ? toTrades(tx) : MOCK_TRADES;
  const notes: HubNote[] =
    posts.length > 0
      ? posts.slice(0, 6).map((p) => ({
          title: p.title,
          author: `${p.district ?? dong} · ${p.created_at.slice(5, 10).replace("-", ".")}`,
          score: `공감 ${p.like_count ?? 0}`,
        }))
      : MOCK_NOTES;

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
      listings: "매물 12",
      listingsSub: "전세 7 · 매매 5",
      notes: `노트 ${posts.length > 0 ? posts.length.toLocaleString("ko-KR") : "3,812"}`,
      notesSub: posts.length > 0 ? "단지 이야기 포함" : "이번 주 +38",
      safety: "A",
    },
    aiTitle: `AI 요약 · ${row.name}`,
    aiBody: latest
      ? `최근 실거래 평균 ${formatManwon(latest.avg_manwon)} (${delta} 전월비) · 채광 상(87%) · 주차 하(74%) — 저층 위주로 현장 확인을 권해요.`
      : "채광 상(87%) · 주차 하(74%) · 최근 “누수” 언급 3단지 저층 집중 (13c 재사용)",
    myRecord: "노트 3건 · 비교 후보 · 예상가 4.7억",
    listingsLabel: "매물 12 · 전세 7 · 매매 5",
    infoRows,
    trades,
    notes,
    listings: MOCK_LISTINGS,
    nearby,
    txHref,
  };
}

async function loadView(id: string): Promise<HubView> {
  try {
    const row = await getComplexById(id);
    if (!row) return MOCK_VIEW;
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
  } catch {
    return MOCK_VIEW;
  }
}

/* ===== SEO — 단지명 title/description, 비로그인 열람 허용 (index 대상) ===== */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let name = MOCK_VIEW.name;
  let region = "안양 동안구 관양동";
  // OG 카드용 시세 — 목업 폴백값(시안 23b)
  let price = MOCK_VIEW.metric.price;
  let delta = "";
  try {
    const row = await getComplexById(id);
    if (row) {
      name = row.name;
      region = `${row.city} ${row.district}`.trim() || region;
      const tx = await getTransactionHistory(row.id, 2).catch(
        () => [] as ComplexTransactionRow[],
      );
      const latest = tx.length > 0 ? tx[tx.length - 1] : null;
      const prev = tx.length > 1 ? tx[tx.length - 2] : null;
      if (latest) {
        price = formatManwon(latest.avg_manwon);
        const d = deltaLabel(pctDelta(latest.avg_manwon, prev?.avg_manwon));
        delta = d.tone === "flat" ? "" : `${d.delta} 전월비`;
      } else {
        price = "시세 준비 중";
        delta = "";
      }
    }
  } catch {
    // env 미설정·조회 실패 시 목업 메타 유지
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
  // 데이터 신선도 라벨(#21) — 조회 실패 시 null → 캡션 미표시
  const freshness = await getMarketFreshnessDateLabel();

  const cta = (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {/* 연결성: 단지명 프리필로 임장노트 작성 진입 (notes/new?apt=) */}
        <Link
          href={`/notes/new?apt=${encodeURIComponent(v.name)}`}
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
