import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import {
  getComplexById,
  getTransactionHistory,
  getComplexPosts,
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

function toView(
  row: ComplexRow,
  tx: ComplexTransactionRow[],
  posts: ComplexPostRow[],
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
  };
}

async function loadView(id: string): Promise<HubView> {
  try {
    const row = await getComplexById(id);
    if (!row) return MOCK_VIEW;
    const [tx, posts] = await Promise.all([
      getTransactionHistory(row.id, 6).catch(() => [] as ComplexTransactionRow[]),
      getComplexPosts(row.id, 6).catch(() => []) as Promise<ComplexPostRow[]>,
    ]);
    return toView(row, tx, posts);
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
  try {
    const row = await getComplexById(id);
    if (row) {
      name = row.name;
      region = `${row.city} ${row.district}`.trim() || region;
    }
  } catch {
    // env 미설정·조회 실패 시 목업 메타 유지
  }
  return {
    title: `${name} 시세·매물·임장노트 | 누구집`,
    description: `${region} ${name} 단지 홈 — 실거래 시세, 매물, 이웃 임장노트, 안전 진단을 한 화면에서 확인하세요.`,
    robots: { index: true, follow: true },
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
    <div className="flex gap-2">
      <Link
        href="/notes/new"
        className="btn-primary btn-cta flex-1 rounded-[11px] p-3 text-center text-[13px]"
      >
        이 단지 노트 쓰기
      </Link>
      <CompareTrayButton complexId={complexId} name={v.name} region={v.dong} />
    </div>
  );

  return (
    <PageShell>
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

      {/* 모바일 CTA 2개 (시안 하단) */}
      <div className="rise-in-4 mt-4 lg:hidden">{cta}</div>
    </PageShell>
  );
}
