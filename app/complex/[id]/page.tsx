import { cache } from "react";
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
import type { PricePoint } from "./PriceTrendChart";
import { decodeComplexId } from "@/lib/complex/complex-store";
import { geocodeAndCache } from "@/lib/map/complex-geocode";
import { settle, startDeadline } from "@/lib/data/section-budget";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { RecentComplexRecorder } from "../../components/RecentComplexes";
import { QaBlock } from "../../components/QaBlock";
import { AdSlot } from "@/app/components/ads/AdSlot";
import type { FaqItem } from "@/lib/seo/jsonld";
import { ComplexReviews } from "../ComplexReviews";
import { ComplexAreaBands } from "./ComplexAreaBands";
import { RegionRelative } from "./RegionRelative";
import { NearbyRedevelopment } from "./NearbyRedevelopment";
import { UpcomingSupply } from "./UpcomingSupply";
import { ComplexQna } from "./ComplexQna";
import { SEOUL_BROWSE_REGIONS, buildComplexTxSlug } from "@/lib/market/complex-transactions";
import {
  complexResidenceJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
} from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { RoadviewButton } from "@/components/map/RoadviewButton";
import {
  listApprovedListings,
  LISTING_TYPE_LABEL,
  type PublicListing,
} from "@/lib/listings/store-db";

/* ============================================================
   단지 허브 (연동 중심축 화면, SEO 핵심 랜딩 겸용)
   실데이터: market_transactions(국토부 실거래) → getComplexById·getTransactionHistory
   + posts(getComplexPosts). 존재하지 않는 단지 → notFound() (사실 우선: 목업 금지).
   (#150 — 이전 주석은 complexes·complex_transactions 를 가리켰으나 두 테이블은
    운영 DB에 없다. 단지·시세 모두 market_transactions 에서 파생된다.)
   비로그인 열람 허용 — index 대상.
   ============================================================ */

/* ── 캐시(운영 P0) ────────────────────────────────────────────────────────
   이 페이지는 searchParams·쿠키·세션을 쓰지 않는다. 주소 하나에 HTML 한 벌이다.

   2026-07-28 사고: `revalidate` 만 적어 두면 ISR 이 되는 줄 알았는데 아니었다.
   동적 세그먼트(`[id]`)에 generateStaticParams 가 없으면 Next 는 이 라우트를
   "요청마다 서버 렌더"로 분류한다. 그러면 응답에 Next 가 직접
   `private, no-cache, no-store` 를 실어 보내고, 미들웨어가 앞서 붙여 둔 공유
   캐시 헤더는 그 값에 덮인다. 빌드 산출물로도 확인된다 —
   .next/prerender-manifest.json 의 dynamicRoutes 에 이 라우트가 없었다.
   사이트맵에 실린 25,310개 단지 주소가 크롤될 때마다 CDN 을 건너뛰고 함수를
   불렀고, Vercel 무료 티어 함수 호출 100만 회가 그렇게 소진됐다.

   빈 배열을 돌려주는 generateStaticParams 가 그 분류를 바꾼다. 빌드 때는 아무
   경로도 미리 만들지 않고(프리렌더 예산은 그대로), 첫 요청에 한 벌 렌더해서
   ISR 캐시에 넣은 뒤 revalidate 창 동안 CDN 이 그걸 재사용한다.

   재검증 창을 2분에서 1시간으로 넓힌 이유: 함수 호출 수를 정하는 눈금이
   바로 이 값이다. 시세 원본은 국토부 실거래라 하루 단위로 들어오지만 이 화면엔
   임장노트·Q&A·매물처럼 사람이 실시간으로 쓰는 것도 같이 있어서 하루를 통째로
   묵히지는 않는다. 1시간이면 그 손해는 감당할 만하고, 크롤러가 같은 주소를
   하루에 몇 번씩 긁어도 오리진 렌더는 시간당 한 번으로 접힌다.
   lib/http/cache-policy.ts 의 같은 경로 규칙도 3600 으로 맞춰 뒀다.
   ──────────────────────────────────────────────────────────────────────── */
export const revalidate = 3600;

/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". dynamicParams 기본값(true)이라
   실제 요청이 오면 그때 만들어 캐시한다. 지우면 다시 완전 동적 SSR 로 돌아가고
   위 사고가 그대로 재현되므로, scripts/check-cache-policy.mjs 가 이 라우트가
   prerender-manifest 의 dynamicRoutes 에 있는지 매 빌드마다 확인한다. */
export function generateStaticParams(): { id: string }[] {
  return [];
}

/**
 * 곁다리 5개 중 몇 개가 실패하면 화면을 그리지 않고 던지는가.
 * 자세한 이유는 loadView() 안의 주석과 /region/[id] 의 같은 이름 상수 참고.
 * (실거래 상세 링크가 질의를 그만두면서 6개 → 5개가 됐다. "거의 다 실패했다"는
 *  뜻을 유지하려고 5/6 이던 기준을 4/5 로 함께 낮춘다.)
 */
const SIDE_FAILURE_ABORT_THRESHOLD = 4;

/**
 * generateMetadata 와 본문은 같은 요청 안에서 각자 이 둘을 불렀다 — 즉 렌더
 * 한 번에 똑같은 쿼리가 두 번씩, 합쳐서 두 왕복이 통째로 낭비였다.
 * React cache() 로 묶으면 요청당 한 번만 실제로 나간다
 * (/complex/tx/[slug] 의 loadPageData 와 같은 방식).
 *
 * 인자가 같아야 합쳐진다는 점이 중요하다. 그래서 메타데이터도 본문과 똑같이
 * 6을 넘긴다 — getTransactionHistory 는 limit 과 무관하게 이 단지의 실거래를
 * 전부 읽어서 월별로 접은 뒤 마지막 limit개만 남기므로(그 함수 끝부분 참고),
 * 2를 주든 6을 주든 DB 에 나가는 쿼리는 완전히 같고 최신·직전 두 달도 그대로다.
 */
const loadComplexRow = cache(getComplexById);
const loadTxHistory = cache(getTransactionHistory);

/** 위 두 loader 가 쓰는 실거래 이력 개월 수 — 메타데이터·본문이 반드시 같아야 한다. */
const TX_HISTORY_MONTHS = 6;

interface HubView {
  id: string;
  name: string;
  dong: string;
  /** 시/도 — JSON-LD addressRegion 용 (dong 은 시군구라 addressLocality) */
  city: string;
  /** 총 세대수 — 대장 마스터에 매칭됐을 때만 값이 있다 */
  households: number | null;
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
  /** 노트 조회가 실패했는지 — 빈 목록을 "없음"으로 단정하지 않기 위해 */
  notesFailed: boolean;
  /** 이 단지에 연결된 글 쓰기 (/town/write?complex=…) */
  notesWriteHref: string;
  listings: HubListing[];
  /** 실거래 월별 평균 시계열 (차트용 · 실데이터만) */
  priceSeries: PricePoint[];
  /** 내부 링크 그물(#34) — 같은 동 다른 단지 (0건이면 섹션 미표시) */
  nearby: { id: string; name: string; meta: string }[];
  /** 국토부 실거래 이력 상세(/complex/tx) — 동일 단지명 매칭 시에만 링크 */
  txHref: string | null;
  /** 지도 좌표 — 거리뷰·JSON-LD geo 용 (목업 폴백은 없음 → 거리뷰 자동 숨김) */
  lat?: number | null;
  lng?: number | null;
  /**
   * 이번 렌더에서 **조회에 실패한** 곁다리 섹션 이름들.
   *
   * 왜 필요한가: 이 화면은 실패를 전부 `.catch(() => [])` 로 삼키고 있었다.
   * 그러면 UI 가 "실매물 준비 중" · "시세 준비 중" 을 그린다 — 우리가 확인한
   * 사실이 아니다. 우리는 *못 읽었을* 뿐이다. 조회 실패는 데이터 없음이 아니다.
   */
  loadFailures: string[];
}

/* ===== 실데이터 변환 (map/page.tsx 방식) ===== */

function formatManwon(manwon: number): string {
  if (!Number.isFinite(manwon) || manwon <= 0) return "—";
  if (manwon >= 10_000) return `${(manwon / 10_000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

/** 부스트 활성 여부 (만료·null 은 false) */
function isBoostActive(boostUntil: string | null): boolean {
  if (!boostUntil) return false;
  const t = Date.parse(boostUntil);
  return Number.isFinite(t) && t > Date.now();
}

/** 매물 가격 라벨 (WON → 매매/전세/월세). 값 없으면 "—". */
function listingPriceLine(l: PublicListing): string {
  if (l.listingType === "monthly") {
    return `월세 ${formatManwon((l.depositKrw ?? 0) / 1e4)}/${formatManwon((l.monthlyKrw ?? 0) / 1e4)}`;
  }
  const krw = l.listingType === "sale" ? l.priceKrw : l.depositKrw;
  return `${LISTING_TYPE_LABEL[l.listingType]} ${formatManwon((krw ?? 0) / 1e4)}`;
}

/** PublicListing → HubListing (허브 매물 탭 카드). D8: 빈 탭에 실 매물 연결. */
function toHubListing(l: PublicListing): HubListing {
  const boost = isBoostActive(l.boostUntil);
  const meta =
    [
      l.areaM2 != null ? `전용 ${l.areaM2}㎡` : null,
      l.floor != null ? `${l.floor}층` : null,
      l.regionName,
    ]
      .filter(Boolean)
      .join(" · ") || "실매물";
  return {
    badge: LISTING_TYPE_LABEL[l.listingType],
    urgent: boost,
    price: listingPriceLine(l),
    priceNote: boost ? "부스트" : l.ownerVerified ? "소유확인" : null,
    meta,
    agent: l.authorLabel,
  };
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

/**
 * 서울 단지 — /complex/tx 상세 링크. **DB 를 다시 읽지 않는다.**
 *
 * 예전에는 여기서 listComplexTransactions(row.name, region, 1) 을 한 번 더 던져
 * "이 단지 실거래가 있나"를 확인했다. 같은 렌더에서 loadTxHistory 가 이미 같은
 * 단지의 market_transactions 를 읽고 있는데도 왕복이 하나 더 나갔고, 서울 단지는
 * 트래픽의 대부분이라 그 왕복이 매 렌더마다 붙었다.
 *
 * 대신 이미 읽은 실거래(txRows)로 판정한다. 두 질의의 조건이 포함관계라서
 * 성립한다 — getTransactionHistory 쪽이 /complex/tx 쪽의 **부분집합**이다:
 *   - complex_name  : 양쪽 같은 등치
 *   - region_name   : 이쪽은 dec.region("서울 OO구") 등치, 저쪽은
 *                     transactionRegionCandidates → ["OO구", "서울 OO구"] 중 하나.
 *                     city/district 는 splitRegion(dec.region) 에서 나오므로
 *                     `${city} ${district}` === dec.region 이 항상 참이다.
 *   - transaction_type='trade' · is_cancelled=false : 양쪽 같음
 *   - property_type='apartment' : 저쪽에만 있지만, market_transactions 에
 *                     행을 넣는 유일한 경로(lib/market/molit-transactions.ts)가
 *                     이 값을 상수로 박아 넣는다(실측 654,815행 전부 apartment).
 *   - deal_amount   : 이쪽 > 0 ⊂ 저쪽 not null
 * 즉 실거래가 1건이라도 잡혔으면 /complex/tx 페이지도 반드시 1건 이상을 본다 —
 * 죽은 링크(그 페이지는 0건이면 notFound)를 내보낼 일이 없다.
 */
function txDetailHref(row: ComplexRow, txRows: ComplexTransactionRow[]): string | null {
  if (txRows.length === 0) return null;
  if (!row.city?.startsWith("서울")) return null;
  const region = SEOUL_BROWSE_REGIONS.find((r) => r.name === row.district?.trim());
  if (!region) return null;
  return `/complex/tx/${buildComplexTxSlug(row.name, region.id)}`;
}

function toView(
  row: ComplexRow,
  tx: ComplexTransactionRow[],
  posts: ComplexPostRow[],
  nearby: HubView["nearby"],
  txHref: string | null,
  listingRows: PublicListing[] = [],
  /** 조회에 실패한 섹션 이름 — "없음"과 "못 읽음"을 다른 문장으로 그리기 위해 */
  loadFailures: string[] = [],
): HubView {
  const txFailed = loadFailures.includes("실거래");
  const listingsFailed = loadFailures.includes("매물");
  const postsFailed = loadFailures.includes("단지 이야기");
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  const prev = tx.length > 1 ? tx[tx.length - 2] : null;
  const { delta, tone } = deltaLabel(latest ? pctDelta(latest.avg_manwon, prev?.avg_manwon) : null);
  const dong = row.district || row.city || "지역";
  // D8: 이 단지 실 매물(승인) 연결 — 없으면 빈 배열(클라이언트가 안내 문구 표시)
  const hubListings = listingRows.map(toHubListing);
  // 사실 우선: 실거래 데이터가 없으면 목업 대신 빈 배열(클라이언트가 안내 문구 표시)
  const trades = tx.length > 0 ? toTrades(tx) : [];
  // 차트용 월별 평균 시계열 (tx는 과거→최신 정렬) — 실데이터만
  const priceSeries: PricePoint[] = tx.map((r) => ({
    ym: r.yyyymm,
    avgManwon: r.avg_manwon,
    dealCount: r.deal_count,
  }));
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
    city: row.city,
    households: row.households,
    followerLabel: "+ 단지 팔로우",
    metric: {
      /* 실패와 없음을 절대 같은 문장으로 그리지 않는다.
         "시세 준비 중" 은 "아직 쌓이지 않았다"는 뜻이고, 조회 실패에 그 문장을
         쓰면 방문자에게 거짓말이 된다. */
      price: txFailed ? "조회 실패" : latest ? formatManwon(latest.avg_manwon) : "시세 준비 중",
      priceSub: txFailed
        ? "실거래를 불러오지 못했습니다"
        : latest
          ? `${delta} 전월비`
          : "실거래 수집 중",
      priceSubClass: txFailed
        ? "text-text-3"
        : tone === "down"
          ? "delta-down"
          : tone === "up"
            ? "delta-up"
            : "text-text-3",
      // D8: 실 매물 연동 — 등록 건수 반영(없으면 "—", 못 읽었으면 그렇다고 적는다)
      listings: listingsFailed ? "매물 ?" : hubListings.length > 0 ? `매물 ${hubListings.length}` : "매물 —",
      listingsSub: listingsFailed
        ? "조회 실패"
        : hubListings.length > 0
          ? "등록된 실매물"
          : "등록 대기",
      notes: postsFailed ? "노트 ?" : `노트 ${posts.length.toLocaleString("ko-KR")}`,
      notesSub: postsFailed
        ? "조회 실패"
        : posts.length > 0
          ? "단지 이야기 포함"
          : "첫 노트를 남겨보세요",
      // 안전등급 산정 미연동 — 허위 등급 금지
      safety: "—",
    },
    aiTitle: `AI 요약 · ${row.name}`,
    aiBody: txFailed
      ? "실거래를 지금 불러오지 못했습니다. 데이터가 없다는 뜻이 아니라 조회에 실패했다는 뜻입니다 — 잠시 후 새로고침해 주세요."
      : latest
        ? `최근 실거래 평균 ${formatManwon(latest.avg_manwon)} (${delta} 전월비) — 국토교통부 실거래가 기준. 현장 확인 후 판단하세요.`
        : "실거래·후기가 쌓이면 AI 요약을 제공합니다.",
    myRecord: "로그인하면 이 단지에 남긴 임장노트를 볼 수 있어요",
    listingsLabel: listingsFailed
      ? "매물 정보를 지금 불러오지 못했습니다 — 등록된 매물이 없다는 뜻이 아닙니다."
      : hubListings.length > 0
        ? `등록된 실매물 ${hubListings.length}건 · 국토부 실거래가와 비교하세요`
        : "실매물 준비 중",
    infoRows,
    trades,
    notes,
    notesFailed: postsFailed,
    notesWriteHref: `/town/write?complex=${encodeURIComponent(row.id)}&complexName=${encodeURIComponent(
      row.name,
    )}`,
    priceSeries,
    // D8: 이 단지 실 매물(승인) 연결
    listings: hubListings,
    nearby,
    txHref,
    lat: row.lat,
    lng: row.lng,
    loadFailures,
  };
}

async function loadView(id: string): Promise<HubView | null> {
  // 사실 우선: 존재하지 않는 단지는 목업 대신 null → notFound()
  const row = await loadComplexRow(id);
  if (!row) return null;
  const dec = decodeComplexId(id);

  /* 곁다리 6개가 **함께** 쓰는 8초 예산.
     예전에는 각 조회가 `.catch(() => [])` 로 실패를 빈 배열로 바꿔서
     "없다"고 그렸고, 느릴 때는 각자 읽기 타임아웃(25초)을 꽉 채워 페이지가
     통째로 매달렸다. 이제 늦거나 실패한 섹션만 접고 페이지는 제때 그린다. */
  const budget = startDeadline();
  const [txR, postsR, sameDongR, coordR, listingsR] = await Promise.all([
    settle(`${row.name} 실거래 이력`, loadTxHistory(row.id, TX_HISTORY_MONTHS), budget.expired),
    settle(`${row.name} 단지 이야기`, getComplexPosts(row.id, 6), budget.expired),
    // #34: 같은 동(district) 다른 단지 — 자기 자신 제외분 확보 위해 5건 조회
    row.district
      ? settle(`${row.district} 인근 단지`, searchComplexes("", row.district, 5), budget.expired)
      : Promise.resolve({ ok: true as const, data: [] as ComplexRow[] }),
    // 좌표 지연 지오코딩(캐시) — 거리뷰·JSON-LD geo 용. 실패 시 좌표 없이 진행.
    dec
      ? settle(
          `${row.name} 좌표`,
          geocodeAndCache(dec.region, dec.name, row.address ?? undefined),
          budget.expired,
        )
      : Promise.resolve({ ok: true as const, data: null }),
    // D8: 이 단지명으로 등록된 승인 매물 (정확 일치)
    settle(`${row.name} 등록 매물`, listApprovedListings({ complexName: row.name }), budget.expired),
  ]);
  budget.done();

  /* 껍데기를 캐시에 얼리지 않는다 (/region/[id] 의 SIDE_FAILURE_ABORT_THRESHOLD
     와 같은 판단). 한두 섹션이 늦는 것은 평상시에도 있는 일이고 그때는 아래
     문구들이 "조회 실패"라고 정직하게 말해 준다. 하지만 5개 중 4개가 한꺼번에
     실패했다면 그건 섹션 문제가 아니라 DB 가 내려간 것이고, 그렇게 만들어진
     빈 화면이 revalidate=120 으로 2분간 고정된다. 5xx 는 캐시되지 않으므로
     던지는 쪽이 정확하다 — "지금은 못 준다"가 "이 단지는 원래 비어 있다"보다
     참이다. */
  const sideResults = [txR, postsR, sameDongR, coordR, listingsR];
  const sideFailures = sideResults.filter((r) => !r.ok).length;
  if (sideFailures >= SIDE_FAILURE_ABORT_THRESHOLD) {
    throw new Error(
      `[/complex/${id}] 곁다리 섹션 ${sideResults.length}개 중 ${sideFailures}개 조회 실패 — ` +
        "빈 껍데기를 캐시에 남기지 않기 위해 렌더를 중단합니다",
    );
  }

  /* 실패한 섹션 이름을 뷰까지 들고 간다 — toView 가 "없음"과 "못 읽음"을
     다른 문장으로 그릴 수 있도록. 좌표·링크는 없어도 화면이 조용히 줄어들
     뿐이라(거리뷰 숨김 등) 문구로 알릴 것이 없어 목록에 넣지 않는다. */
  const loadFailures: string[] = [];
  if (!txR.ok) loadFailures.push("실거래");
  if (!postsR.ok) loadFailures.push("단지 이야기");
  if (!listingsR.ok) loadFailures.push("매물");

  const coord = coordR.ok ? coordR.data : null;
  const located: ComplexRow = coord ? { ...row, lat: coord.lat, lng: coord.lng } : row;
  return toView(
    located,
    txR.ok ? txR.data : [],
    postsR.ok ? postsR.data : [],
    toNearby(sameDongR.ok ? sameDongR.data : [], located.id),
    txDetailHref(located, txR.ok ? txR.data : []),
    listingsR.ok ? listingsR.data : [],
    loadFailures,
  );
}

/* ===== SEO — 단지명 title/description, 비로그인 열람 허용 (index 대상) ===== */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  /* 사실 우선: 존재하지 않는 단지는 목업 메타 대신 noindex 안내.
     여기 try/catch 로 실패를 null 로 바꾸던 자리다. getComplexById 는 없는
     단지에만 null 을 주고 조회 실패는 던지도록 일부러 만들어졌는데(그 함수
     주석 참고), 그 설계를 이 catch 가 되돌리고 있었다 — 실재하는 단지가
     장애 몇 초 때문에 "찾을 수 없습니다" + noindex,nofollow 로 나갔다.
     이제 던지게 둔다: 본문과 똑같이 5xx 가 되고, 크롤러는 "나중에 다시 오라"로
     읽는다. 404·noindex 는 정말 없는 단지에만 남는다. */
  const row: ComplexRow | null = await loadComplexRow(id);
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
  /* .catch(() => []) 로 삼키던 자리다. 실패하면 price 가 "시세 준비 중"으로
     남고 그 문자열이 OG 이미지 쿼리에 그대로 실려, 공유 카드가 "아직 시세를
     안 만들었다"고 단정했다 — 사실은 못 읽은 것뿐이다. 본문도 실패하면 던지므로
     메타데이터도 똑같이 던진다. */
  const tx: ComplexTransactionRow[] = await loadTxHistory(row.id, TX_HISTORY_MONTHS);
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

  // G6: 단지 허브는 사이트맵 URL 의 대부분(2,000건)을 차지하는 롱테일 랜딩이다.
  // canonical 이 없으면 `?utm_...`·중복 진입 경로마다 별개 URL 로 색인돼 신호가 쪼개진다.
  const alternates = seoAlternates(`/complex/${encodeURIComponent(row.id)}`);

  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical as string,
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

  /* JSON-LD — 이 페이지가 설명하는 실체는 "단지 하나"다.
     G6 이전엔 ApartmentComplex(@id 있음)와 별도의 Residence(@id 없음) 두 노드를
     같이 내보내 같은 건물이 서로 다른 두 엔티티로 읽혔다. 하나로 합치고,
     Residence 쪽에만 있던 좌표·읍면동을 ApartmentComplex 로 옮겼다.
     값은 전부 페이지가 이미 가진 실데이터 — 없으면 필드 자체를 넣지 않는다. */
  const complexAddress = v.infoRows.find((r) => r.label === "주소")?.value ?? null;
  /* JSON-LD 에는 확인된 값만 넣는다. "시세 준비 중"·"조회 실패" 같은 상태
     문구가 priceRange 로 새 나가면 구조화 데이터가 곧 거짓말이 된다. */
  const complexPriceRange =
    v.metric.price && !/준비|수집|실패|\?/.test(v.metric.price) ? v.metric.price : null;
  const complexJsonLd = [
    complexResidenceJsonLd({
      id: complexId,
      name: v.name,
      address: complexAddress,
      // dong = row.district(시군구) 이므로 addressLocality, 시/도는 city
      regionName: v.city,
      locality: v.dong,
      lat: v.lat,
      lng: v.lng,
      households: v.households,
      priceRange: complexPriceRange,
    }),
    /* 예전엔 여기에 { name: v.dong } 이 끼어 있었다. 동 이름만 있고 갈 수 있는
       페이지가 없어 item(URL)이 빠졌고, 구글은 이걸 심각 오류로 보고 이 페이지의
       탐색경로를 통째로 무시했다(2026-07-27 Search Console). 링크 없는 라벨은
       탐색경로의 단계가 아니다 — 지역 상세 페이지가 생기면 그때 URL과 함께 넣는다. */
    breadcrumbJsonLd([
      { name: "홈", url: "/" },
      { name: v.name, url: `/complex/${encodeURIComponent(complexId)}` },
    ]),
  ];

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
      {/* JSON-LD(ApartmentComplex + Breadcrumb) — 단지 하나를 한 노드로 기술 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(complexJsonLd) }}
      />

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
          <div className="text-base font-extrabold text-success">{v.metric.safety}</div>
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
          notesFailed={v.notesFailed}
          notesWriteHref={v.notesWriteHref}
          listings={v.listings}
          priceSeries={v.priceSeries}
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
          {/* H1 — "AD / 이 지역 추천 서비스" 가짜 광고 상자였던 자리.
              실제 슬롯으로 교체 — 보여 줄 광고가 없으면 빈 상자를 남기지 않는다. */}
          <AdSlot placement="community_feed" seed={0} plan={null} />
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

      {/* D5 면적대별 시세 · D6 지역 대비 · D3 정비사업 · D4 입주물량 · D2 Q&A (실데이터, 없으면 자동 생략) */}
      <ComplexAreaBands complexId={complexId} />
      <RegionRelative complexId={complexId} />
      <NearbyRedevelopment sigungu={v.dong} />
      <UpcomingSupply area={v.dong} />
      <ComplexQna complexName={v.name} />

      {/* G5+G13 — 실데이터 Q&A + FAQPage 스키마. 시세가 "준비 중"이면 그 질문은 뺀다. */}
      {(() => {
        const faq: FaqItem[] = [];
        if (complexPriceRange) {
          faq.push({
            q: `${v.name} 최근 실거래 평균가는 얼마인가요?`,
            a: `국토교통부 실거래 신고 기준 ${v.name}의 최근 월 실거래 평균은 ${v.metric.price}입니다 (${v.metric.priceSub}). 면적대별 시세는 위 면적대별 표를 참고하세요. 매물 호가가 아닌 신고된 실거래 기준입니다.`,
          });
        }
        if (typeof v.households === "number" && v.households > 0) {
          faq.push({
            q: `${v.name}는 몇 세대 단지인가요?`,
            a: `${v.name}는 ${v.dong}에 위치한 총 ${v.households.toLocaleString("ko-KR")}세대 단지입니다 (공동주택 공공데이터 기준).`,
          });
        }
        return <div className="mt-6"><QaBlock title={`${v.name} Q&A`} items={faq} /></div>;
      })()}

      {/* N17 — 위젯 배포 진입점. 위젯에는 출처 링크가 박혀 있으므로 퍼가기가 곧 백링크다. */}
      <div className="rise-in-5 mt-6 flex flex-col gap-1 rounded-[14px] border border-line bg-surface p-4">
        <span className="text-[13px] font-extrabold text-ink">
          이 단지 시세를 블로그에 붙이기
        </span>
        <span className="text-[12px] leading-[1.7] text-text-2">
          최근 실거래 시세 카드를 iframe 한 줄로 퍼갈 수 있습니다. 시세가 갱신되면 붙여넣은
          위젯도 함께 갱신됩니다.
        </span>
        <Link
          href={`/widget?complex=${encodeURIComponent(complexId)}`}
          className="mt-2 w-fit rounded-[10px] bg-primary px-4 py-2 text-[12px] font-bold text-white"
        >
          위젯 코드 만들기 ›
        </Link>
      </div>

      {/* 모바일 CTA 2개 (시안 하단) */}
      <div className="rise-in-4 mt-4 lg:hidden">{cta}</div>
    </PageShell>
  );
}
