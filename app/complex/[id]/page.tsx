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
  WatchlistButton,
  type HubTrade,
  type HubNote,
  type HubListing,
} from "./hub-client";
import type { PricePoint } from "./PriceTrendChart";
import { complexCanonicalPath, decodeComplexId } from "@/lib/complex/complex-store";
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
import { ComplexNotesNewsAi } from "./ComplexNotesNewsAi";
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
 * TX_HISTORY_MONTHS 를 넘긴다 — getTransactionHistory 는 limit 과 무관하게
 * 이 단지의 실거래를 전부 읽어서 월별로 접은 뒤 마지막 limit개만 남긴다.
 */
/* 10초 상한. 이 조회는 페이지의 1단(이게 끝나야 곁다리 8초 예산이 시작된다)
   이라 여기 상한이 없으면 3단 직렬(row → 곁다리 → 신선도)의 최악이 함수
   상한을 넘본다. 주의: 시간 초과는 **throw** 다 — null 로 바꾸면 notFound()
   가 "조회 실패"를 "없는 단지(404)"로 위장한다. */
const COMPLEX_ROW_TIMEOUT_MS = 10_000;
const loadComplexRow = cache(async (id: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getComplexById(id),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`단지 정보 조회 시간 초과 (${COMPLEX_ROW_TIMEOUT_MS}ms)`)),
          COMPLEX_ROW_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
});
const loadTxHistory = cache(getTransactionHistory);

/** 위 두 loader 가 쓰는 실거래 이력 개월 수 — 메타데이터·본문이 반드시 같아야 한다.
 *  허브 밀도: 18→24개월 (패널 detail API 와 맞춤). */
const TX_HISTORY_MONTHS = 24;

interface HubView {
  id: string;
  name: string;
  dong: string;
  /** 시/도 — JSON-LD addressRegion 용 (dong 은 시군구라 addressLocality) */
  city: string;
  /** 총 세대수 — 대장 마스터에 매칭됐을 때만 값이 있다 */
  households: number | null;
  metric: {
    price: string;
    priceSub: string;
    priceSubClass: string;
    listings: string;
    listingsSub: string;
    notes: string;
    notesSub: string;
    /** 최근 집계 기간 거래 건수 라벨 */
    deals: string;
    dealsSub: string;
    /** 준공/경과 라벨 */
    age: string;
    ageSub: string;
  };
  /** 상단 칩용 요약 스펙 */
  chips: string[];
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
    const range =
      row.min_manwon != null &&
      row.max_manwon != null &&
      row.min_manwon !== row.max_manwon
        ? ` · ${formatManwon(row.min_manwon)}~${formatManwon(row.max_manwon)}`
        : "";
    const area = row.area_m2 != null ? ` · ${Math.round(row.area_m2)}㎡` : "";
    items.push({
      date: `${row.yyyymm.slice(0, 4)}.${row.yyyymm.slice(4, 6)}`,
      price: formatManwon(row.avg_manwon),
      sub: `${row.deal_count}건${area}${range}`,
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
    .slice(0, 8)
    .map((c) => {
      const parts: string[] = [];
      if (c.build_year) parts.push(`${c.build_year}년`);
      if (c.households) parts.push(`${c.households.toLocaleString("ko-KR")}세대`);
      if (c.parking_per_hh) parts.push(`주차 ${c.parking_per_hh}`);
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
      ? posts.slice(0, 12).map((p) => {
          const eng = [
            `공감 ${p.like_count ?? 0}`,
            p.comment_count != null && p.comment_count > 0
              ? `댓글 ${p.comment_count}`
              : null,
            p.view_count != null && p.view_count > 0 ? `조회 ${p.view_count}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return {
            title: p.title,
            author: `${p.district ?? dong} · ${p.created_at.slice(5, 10).replace("-", ".")}`,
            score: eng || `공감 ${p.like_count ?? 0}`,
          };
        })
      : [];

  const dealSum = tx.reduce((s, r) => s + (r.deal_count || 0), 0);
  const chips: string[] = [];
  if (row.build_year) {
    chips.push(
      `${row.build_year}년 · ${new Date().getFullYear() - row.build_year}년차`,
    );
  }
  if (row.households) chips.push(`${row.households.toLocaleString("ko-KR")}세대`);
  if (row.building_count) chips.push(`${row.building_count}동`);
  if (row.parking_per_hh) chips.push(`주차 ${row.parking_per_hh}대/세대`);
  if (row.builder_name) chips.push(row.builder_name);
  if (row.heating) chips.push(row.heating);
  if (row.building_type) chips.push(row.building_type);
  if (hubListings.length > 0) chips.push(`매물 ${hubListings.length}`);
  if (posts.length > 0) chips.push(`이야기 ${posts.length}`);
  if (dealSum > 0) chips.push(`${tx.length}개월 ${dealSum}건`);

  const infoRows: { label: string; value: string }[] = [];
  if (row.build_year) {
    const age = new Date().getFullYear() - row.build_year;
    infoRows.push({ label: "준공", value: `${row.build_year}년 (경과 ${age}년)` });
  }
  if (row.households)
    infoRows.push({ label: "세대수", value: `${row.households.toLocaleString("ko-KR")}세대` });
  if (row.building_count)
    infoRows.push({ label: "동 수", value: `${row.building_count.toLocaleString("ko-KR")}동` });
  if (row.parking_count)
    infoRows.push({ label: "주차", value: `${row.parking_count.toLocaleString("ko-KR")}대` });
  if (row.parking_per_hh)
    infoRows.push({ label: "세대당 주차", value: `${row.parking_per_hh}대` });
  if (row.builder_name) infoRows.push({ label: "시공사", value: row.builder_name });
  if (row.heating) infoRows.push({ label: "난방", value: row.heating });
  if (row.building_type) infoRows.push({ label: "유형", value: row.building_type });
  if (row.total_floors) infoRows.push({ label: "층수", value: `${row.total_floors}층` });
  if (row.kapt_code) infoRows.push({ label: "단지코드", value: row.kapt_code });
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
      deals: txFailed ? "거래 ?" : dealSum > 0 ? `${dealSum}건` : "—",
      dealsSub: txFailed
        ? "조회 실패"
        : dealSum > 0
          ? `최근 ${tx.length}개월`
          : "실거래 없음",
      age: row.build_year
        ? `${new Date().getFullYear() - row.build_year}년`
        : "—",
      ageSub: row.build_year ? `${row.build_year}년 준공` : "준공 미확인",
    },
    chips,
    aiTitle: `AI 요약 · ${row.name}`,
    aiBody: txFailed
      ? "실거래를 지금 불러오지 못했습니다. 데이터가 없다는 뜻이 아니라 조회에 실패했다는 뜻입니다 — 잠시 후 새로고침해 주세요."
      : latest
        ? [
            `최근 실거래 평균 ${formatManwon(latest.avg_manwon)} (${delta} 전월비)`,
            latest.deal_count ? `해당 월 ${latest.deal_count}건` : null,
            row.households ? `총 ${row.households.toLocaleString("ko-KR")}세대` : null,
            row.build_year ? `${row.build_year}년 준공` : null,
            row.builder_name ? `시공사 ${row.builder_name}` : null,
            "국토교통부 실거래·공공데이터 기준. 투자 권유가 아니며 현장 확인 후 판단하세요.",
          ]
            .filter(Boolean)
            .join(" · ")
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
  /* 항목 25: budget.signal 을 로더에 넘겨, 예산 초과로 접힌 섹션의 PostgREST
     요청이 실제로 끊기게 한다(안 끊으면 최대 45초 더 살아 연결을 붙잡는다).
     loadTxHistory 는 React cache() 로 렌더 내 재사용(아래 tx 재호출)되므로
     signal 을 받지 않는다 — 인자에 신호를 섞으면 dedupe 키가 깨진다. */
  const [txR, postsR, sameDongR, coordR, listingsR] = await Promise.all([
    /* canonical_id 를 쓴다 — row.id 는 kapt 매칭 시 `kapt.A10027336` 이 되는데
       getTransactionHistory 는 decodeComplexId 로 시작하고 그 함수는 kapt id 에
       null 을 준다. 그래서 실거래가 160~212건 있는 단지가 조용히 빈 배열을 받아
       "실거래 없음 · 시세 준비 중"으로 그려지고 있었다(2026-08-05 표본 12개 중 6개).
       canonical_id 는 항상 name-id 라 decode 가 반드시 성공한다. */
    settle(`${row.name} 실거래 이력`, loadTxHistory(row.canonical_id, TX_HISTORY_MONTHS), budget.expired),
    settle(`${row.name} 단지 이야기`, getComplexPosts(row.id, 12, budget.signal), budget.expired),
    // #34: 같은 동(district) 다른 단지 — 자기 자신 제외분 확보 위해 더 넓게
    row.district
      ? settle(
          `${row.district} 인근 단지`,
          searchComplexes("", row.district, 9, budget.signal),
          budget.expired,
        )
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
    settle(
      `${row.name} 등록 매물`,
      listApprovedListings({ complexName: row.name, signal: budget.signal }),
      budget.expired,
    ),
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
  /* 본문(line ~527)과 **반드시 같은 인자**여야 한다 — loadTxHistory 는 cache() 라
     인자가 다르면 렌더 안에서 두 번 조회하고, 메타데이터와 본문이 다른 값을 말한다.
     canonical_id 를 쓰는 이유는 본문 쪽 주석 참고. */
  const tx: ComplexTransactionRow[] = await loadTxHistory(row.canonical_id, TX_HISTORY_MONTHS);
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

  // G6: 단지 허브는 사이트맵 URL 의 대부분(2.5만 건)을 차지하는 롱테일 랜딩이다.
  // canonical 이 없으면 `?utm_...`·중복 진입 경로마다 별개 URL 로 색인돼 신호가 쪼개진다.
  //
  // N-fix(2026-08-05): 여기서 `row.id` 를 쓰고 있었다. kapt 매칭이 되면 id 가
  // `kapt.A10027336` 으로 바뀌는데, 사이트맵은 (region_name, complex_name) 만 가진
  // 집계 MV 에서 만들어져 그 형태를 낼 수 없다. 그래서 제출 URL 과 canonical 이
  // 갈라졌고, 구글은 제출 URL 을 "대체 페이지(적절한 표준 태그 있음)"로 처리해
  // 색인하지 않았다. 실측 30%(약 7,700개 URL).
  // canonical_id 는 kapt 매칭 여부와 무관하게 항상 name-id 라 사이트맵과 일치한다.
  const alternates = seoAlternates(complexCanonicalPath(row));

  /* 선별 색인 — 실거래가 한 건도 없는 단지는 "시세 준비 중 · 거래 없음 · 노트 0"
     만 남는 템플릿 페이지다. 이런 URL 을 2만 개 색인 요청하면 크롤 예산을 태우고
     사이트 전체 품질 평가를 끌어내린다(구글 scaled content abuse).
     follow 는 유지해서 내부 링크는 계속 따라가게 둔다.
     tx 는 위에서 이미 읽었으므로 추가 조회가 없다. 거래가 들어오는 순간
     자동으로 색인 대상이 된다 — 별도 배치가 필요 없다. */
  const hasSubstance = tx.length > 0;

  return {
    title,
    description,
    robots: hasSubstance
      ? { index: true, follow: true }
      : { index: false, follow: true },
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
  /* 신선도 라벨은 row 에 의존하지 않는다 — 본문 로드와 병렬로 받는다.
     (직렬이면 이 페이지의 3단 직렬 최악이 그만큼 더 길어진다.) */
  const [v, freshness] = await Promise.all([
    loadView(complexId),
    // 데이터 신선도 라벨(#21) — 조회 실패 시 null → 캡션 미표시
    getMarketFreshnessDateLabel(),
  ]);
  // 사실 우선: 존재하지 않는 단지는 목업 대신 404
  if (!v) notFound();

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
        {/* 동/구 칩 — 예전엔 옆의 "‹ 지도" Link 와 완전히 같은 생김새인데 href 가
            없었다. 지역 지도로 실제로 이동하게 한다(?region= 지원 추가됨). */}
        <Link
          href={`/map?region=${encodeURIComponent(v.dong)}`}
          className="chip border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-text-2"
        >
          {v.dong}
        </Link>
        <span className="chip bg-ink px-2.5 py-1 text-[11px] font-extrabold text-white">
          {v.name}
        </span>
      </div>

      {/* 단지명 + 팔로우 — 가격 히어로와 한 덩어리 */}
      <div className="rise-in mt-3 overflow-hidden rounded-[20px] border border-[#e8edf5] bg-gradient-to-br from-[#eef3ff] via-surface to-[#f7f9fd] px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold tracking-tight text-ink md:text-[26px]">
              {v.name}
            </h1>
            <p className="mt-0.5 text-[12px] text-text-2">
              {v.dong}
              {v.city && v.city !== v.dong ? ` · ${v.city}` : ""}
            </p>
          </div>
          <WatchlistButton complexId={v.id} complexName={v.name} />
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-text-3">
              최근 실거래 평균
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-[30px] font-extrabold leading-none text-ink tabular-nums md:text-[34px]">
                {v.metric.price}
              </span>
              <span className={`text-[13px] font-extrabold ${v.metric.priceSubClass}`}>
                {v.metric.priceSub}
              </span>
            </div>
          </div>
          {typeof v.lat === "number" && typeof v.lng === "number" && (
            <RoadviewButton lat={v.lat} lng={v.lng} label={v.name} />
          )}
        </div>

        {v.chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {v.chips.map((c) => (
              <span
                key={c}
                className="chip-soft rounded-full px-2.5 py-[4px] text-[11px] font-bold text-text-2"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 지표 6칸 — 시세·거래·매물·노트·세대·연차 */}
      <div className="rise-in-1 mt-3 grid grid-cols-3 gap-1.5 md:grid-cols-6">
        <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
          <div className="text-[10px] text-text-3">시세</div>
          <div className="mt-0.5 truncate text-[14px] font-extrabold text-ink sm:text-base">
            {v.metric.price}
          </div>
          <div className={`mt-0.5 truncate text-[10px] font-bold ${v.metric.priceSubClass}`}>
            {v.metric.priceSub}
          </div>
        </div>
        <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
          <div className="text-[10px] text-text-3">거래</div>
          <div className="mt-0.5 truncate text-[14px] font-extrabold text-ink sm:text-base">
            {v.metric.deals}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-text-3">{v.metric.dealsSub}</div>
        </div>
        <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
          <div className="text-[10px] text-text-3">매물</div>
          <div className="mt-0.5 truncate text-[14px] font-extrabold text-ink sm:text-base">
            {v.metric.listings}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-text-3">{v.metric.listingsSub}</div>
        </div>
        <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
          <div className="text-[10px] text-text-3">노트</div>
          <div className="mt-0.5 truncate text-[14px] font-extrabold text-ink sm:text-base">
            {v.metric.notes}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-text-3">{v.metric.notesSub}</div>
        </div>
        <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
          <div className="text-[10px] text-text-3">세대</div>
          <div className="mt-0.5 truncate text-[14px] font-extrabold text-ink sm:text-base">
            {v.households ? `${v.households.toLocaleString("ko-KR")}` : "—"}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-text-3">
            {v.households ? "공공데이터" : "미확인"}
          </div>
        </div>
        <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
          <div className="text-[10px] text-text-3">연차</div>
          <div className="mt-0.5 truncate text-[14px] font-extrabold text-ink sm:text-base">
            {v.metric.age}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-text-3">{v.metric.ageSub}</div>
        </div>
      </div>

      {/* 스펙 시트 — 3열 밀도 */}
      {v.infoRows.length > 0 && (
        <div className="rise-in-1 card mt-3 rounded-[16px] px-4 py-3">
          <div className="mb-1 flex items-baseline justify-between">
            <div className="text-[13px] font-extrabold text-ink">단지 스펙</div>
            <div className="text-[10px] text-text-3">{v.infoRows.length}항목</div>
          </div>
          <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
            {v.infoRows.map((r) => (
              <div
                key={r.label}
                className="flex items-baseline justify-between gap-3 border-b border-[#f0f3f8] py-[6px] text-xs last:border-b-0"
              >
                <span className="shrink-0 text-text-3">{r.label}</span>
                <span className="truncate text-right font-bold text-ink">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 면적대·지역 대비 — 상단 밀도 블록 */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ComplexAreaBands complexId={complexId} compact />
        <RegionRelative complexId={complexId} compact />
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

        {/* 데스크탑 우측 — 중복 스펙 대신 한눈에 + 인근 + CTA */}
        <aside className="hidden flex-col gap-3 lg:flex">
          <div className="rise-in-2 card flex flex-col gap-2 rounded-[18px] px-4 py-4">
            <div className="text-[13px] font-extrabold text-ink">한눈에 보기</div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-xl bg-[#f5f7fb] px-2.5 py-2">
                <div className="text-[10px] text-text-3">시세</div>
                <div className="text-[14px] font-extrabold text-ink">{v.metric.price}</div>
              </div>
              <div className="rounded-xl bg-[#f5f7fb] px-2.5 py-2">
                <div className="text-[10px] text-text-3">거래</div>
                <div className="text-[14px] font-extrabold text-ink">{v.metric.deals}</div>
              </div>
              <div className="rounded-xl bg-[#f5f7fb] px-2.5 py-2">
                <div className="text-[10px] text-text-3">매물</div>
                <div className="text-[14px] font-extrabold text-ink">{v.metric.listings}</div>
              </div>
              <div className="rounded-xl bg-[#f5f7fb] px-2.5 py-2">
                <div className="text-[10px] text-text-3">노트</div>
                <div className="text-[14px] font-extrabold text-ink">{v.metric.notes}</div>
              </div>
            </div>
            {v.chips.slice(0, 8).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {v.chips.slice(0, 8).map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-[#f2f4f8] chip-pad text-[10px] font-bold text-text-2"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
          {v.nearby.length > 0 && (
            <div className="rise-in-2 card flex flex-col gap-1.5 rounded-[18px] px-4 py-3.5">
              <div className="mb-0.5 text-[13px] font-extrabold text-ink">
                {v.dong} 다른 단지
              </div>
              {v.nearby.slice(0, 5).map((n) => (
                <Link
                  key={n.id}
                  href={`/complex/${encodeURIComponent(n.id)}`}
                  className="rounded-xl px-2 py-2 transition-colors hover:bg-[#f5f7fb]"
                >
                  <div className="truncate text-[12px] font-bold text-ink">{n.name}</div>
                  <div className="truncate text-[10px] text-text-3">{n.meta}</div>
                </Link>
              ))}
            </div>
          )}
          <div className="rise-in-3">{cta}</div>
          <AdSlot placement="community_feed" seed={0} plan={null} />
        </aside>
      </div>

      {/* 내부 링크 그물(#34) — 모바일·전체 그리드 */}
      {v.nearby.length > 0 && (
        <section className="rise-in-5 mt-6">
          <h2 className="mb-2 px-1 text-[15px] font-extrabold text-ink">
            {v.dong} 다른 단지{" "}
            <span className="text-[12px] font-medium text-text-3">{v.nearby.length}곳</span>
          </h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {v.nearby.map((n) => (
              <Link
                key={n.id}
                href={`/complex/${encodeURIComponent(n.id)}`}
                className="card card-hover rounded-2xl px-3.5 py-3"
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

      {/* D3 정비사업 · D4 입주물량 · D2 Q&A (면적대·지역대비는 상단으로 이동) */}
      <NearbyRedevelopment sigungu={v.dong} />
      <UpcomingSupply area={v.dong} />
      <ComplexQna
        complexName={v.name}
        region={`${v.city} ${v.dong}`.trim()}
        /* 항목 18 — 노트 조회 실패면 null (0개라고 지어내지 않는다) */
        noteCount={v.notesFailed ? null : v.notes.length}
      />

      {/* 이 단지 임장노트 · AI 분석 재료 · 관련 기사 —
          지도 팝업에서 "전체 화면으로 자세히 보기"로 넘어온 사람이 더 알고 싶은 것들.
          위쪽 "단지 이야기"는 커뮤니티 글이고, 이쪽은 직접 다녀와 쓴 임장노트다. */}
      <ComplexNotesNewsAi
        complexId={complexId}
        name={v.name}
        region={v.dong}
        hasPrice={v.priceSeries.length > 0}
        tradeCount={v.trades.length}
      />

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
