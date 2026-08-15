"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { Logo } from "../components/Logo";
import { WelcomeHandoff } from "./WelcomeHandoff";
import { NaverMap, type MapIdleInfo, type MapMarkerData } from "@/components/map/NaverMap";
import {
  MapSearchBox,
  type MapSearchSelectAddress,
  type MapSearchSelectComplex,
} from "./MapSearchBox";
import dynamic from "next/dynamic";

/* 첫 페인트에 렌더되지 않는 패널은 지연 로드 — 라우트 청크에서 분리(웹 성능).
   ComplexInfoPanel(915줄)·매물 미리보기·히스토그램 슬라이더·코치마크는 전부
   상호작용 후에만 열린다. ssr:false — 지도 위 오버레이라 서버 HTML 이 필요 없다. */
const ComplexInfoPanel = dynamic(
  () => import("./ComplexInfoPanel").then((m) => m.ComplexInfoPanel),
  { ssr: false },
);
import { CompareTrayButton } from "@/app/complex/[id]/hub-client";
const HistogramRangeSlider = dynamic(
  () => import("./HistogramRangeSlider").then((m) => m.HistogramRangeSlider),
  { ssr: false },
);
const ListingPreviewPanel = dynamic(
  () => import("./ListingPreviewPanel").then((m) => m.ListingPreviewPanel),
  { ssr: false },
);
import {
  colorForType,
  labelForType,
  stageLabel,
  type RedevelopmentProject,
} from "@/lib/redevelopment/types";
import { Icon } from "@/app/components/Icon";
import type { CoachmarkStep } from "@/app/components/CoachmarkTour";
const CoachmarkTour = dynamic(
  () => import("@/app/components/CoachmarkTour").then((m) => m.CoachmarkTour),
  { ssr: false },
);
import {
  NO_DATA_COLOR,
  NO_DATA_LABEL,
  PRICE_TIERS,
  pyeongPriceLabel,
  tierColor,
  tierTextColor,
} from "@/lib/map/price-tiers";

/** A1 — 지도 첫 방문 3스텝 안내. 대상이 화면에 없으면 그 스텝은 자동 생략된다. */
const MAP_TOUR_STEPS: CoachmarkStep[] = [
  {
    target: "map-price-panel",
    keepIfMissing: true,
    title: "가격은 실거래 기준이에요",
    body: "지도와 목록의 금액은 국토부 실거래가 평균입니다. 중개사가 올린 매물 호가와는 다른 값이니, 두 숫자를 섞어서 보지 마세요.",
  },
  {
    target: "map-filter",
    title: "조건으로 후보 좁히기",
    body: "면적·준공연도·거래유형·매물 조건으로 임장 후보를 걸러낼 수 있어요. 반경 그리기도 여기 있습니다.",
  },
  {
    target: "map-note-cta",
    title: "본 곳은 바로 임장노트로",
    body: "관심 단지를 찾았다면 노트를 남기세요. 저장 후 AI 정리 → 지도에서 후보를 나란히 비교하는 흐름으로 이어집니다.",
  },
];

/* ============================================================
   지도 탐색 (6a) — 실제 네이버 지도 + 글래스 오버레이 UI
   단지 목록·시세는 서버(page.tsx)에서 Supabase 실데이터로 주입,
   실패 시 목업 폴백. SDK 로드 실패 시 그라데이션 폴백 유지.
   ============================================================ */

export interface TradeItem {
  date: string;
  price: string;
  sub: string;
  delta: string;
  tone: "up" | "down" | "flat";
}

export interface DanjiItem {
  id: string;
  name: string;
  note: string | null;
  meta: string;
  price: string;
  delta: string;
  deltaTone: "up" | "down" | "flat";
  size: string;
  lat: number;
  lng: number;
  avgPriceWon: number | null;
  momPct: number | null;
  /** 최근 실거래 평균 전용면적(㎡) — 면적대 필터용, 없으면 null */
  areaM2: number | null;
  /** 준공연도 — 준공연도 필터용, 없으면 null */
  buildYear: number | null;
  /** 세대수 — 세대수 규모 필터용, 없으면 null */
  households: number | null;
  /** 건물유형(아파트/오피스텔/빌라 등) — 매물유형 필터용, 없으면 null */
  buildingType: string | null;
  trades: TradeItem[];
  /** 최신 거래월 라벨("2026.07") — 대표가격 근거 표기용, 없으면 null */
  latestYm: string | null;
  /** 최신월 거래 건수 — 대표가격 근거·표본 부족 판단용, 없으면 null */
  latestDealCount: number | null;
}

type Zoom = "city" | "dong" | "danji";

const ZOOM_TABS: { key: Zoom; label: string }[] = [
  { key: "city", label: "시·군·구" },
  { key: "dong", label: "동" },
  { key: "danji", label: "단지" },
];

const ZOOM_CAPTION: Record<Zoom, string> = {
  city: "줌 레벨 9 · 지역 집계 버블",
  dong: "줌 레벨 12 · 동별 시세 + 활동량",
  danji: "줌 레벨 15 · 단지/매물 표시",
};

/** 내부 level(1~14) — naver zoom = 21 - level (city 9 / dong 12 / danji 15) */
const LEVEL_BY_ZOOM: Record<Zoom, number> = { city: 12, dong: 9, danji: 6 };

// 사실 우선: 단지 상세 탭 라벨엔 허위 건수(매물 12·노트 15)를 넣지 않는다
const DETAIL_TABS = ["요약", "매물", "실거래", "노트", "이야기"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6 L22 10.4 V20 a1.4 1.4 0 0 1 -1.4 1.4 H14.8 V14.6 H9.2 V21.4 H3.4 A1.4 1.4 0 0 1 2 20 V10.4 Z"
        fill="#8b95a1"
      />
    </svg>
  );
}

function deltaClass(tone: "up" | "down" | "flat"): string {
  return tone === "down" ? "delta-down" : tone === "up" ? "delta-up" : "delta-flat";
}

/* ===== 필터 (네이버부동산·직방식 가격대·면적대·준공연도) =====
   서버 클러스터(지역 집계 버블)는 셀 단위 합계라 적용 불가 —
   단지 목록·단지 마커(포인트 모드)에만 클라이언트 필터링. */

/** 거래유형(매물 레이어) — 매매/전세/월세 → /api/map/listings?type= */
const LISTING_TRADE_OPTIONS: { key: string; label: string; type?: string }[] = [
  { key: "all", label: "전체" },
  { key: "sale", label: "매매", type: "sale" },
  { key: "jeonse", label: "전세", type: "jeonse" },
  { key: "monthly", label: "월세", type: "monthly" },
];

/** 건물 유형 — 매물 레이어 필터 (/api/map/listings?kind=) */
const PROPERTY_KIND_OPTIONS: { key: string; label: string; kind?: string }[] = [
  { key: "all", label: "전체" },
  { key: "apartment", label: "아파트", kind: "apartment" },
  { key: "villa", label: "빌라", kind: "villa" },
  { key: "detached", label: "단독주택", kind: "detached" },
  { key: "officetel", label: "오피스텔", kind: "officetel" },
  { key: "commercial", label: "상가", kind: "commercial" },
];

const ROOM_OPTIONS: { key: string; label: string; min?: number }[] = [
  { key: "all", label: "전체" },
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({
    key: String(n),
    label: `${n}개+`,
    min: n,
  })),
];

const BATH_OPTIONS: { key: string; label: string; min?: number }[] = [
  { key: "all", label: "전체" },
  ...[1, 2, 3, 4].map((n) => ({
    key: String(n),
    label: `${n}개+`,
    min: n,
  })),
];

const PARKING_OPTIONS: { key: string; label: string; min?: number }[] = [
  { key: "all", label: "전체" },
  { key: "1", label: "1대+", min: 1 },
  { key: "2", label: "2대+", min: 2 },
  { key: "3", label: "3대+", min: 3 },
];

/* 가격대·면적대·준공연도 고정 칩(PRICE_OPTIONS/AREA_OPTIONS/YEAR_OPTIONS)과
   그 판정 함수 inRange 는 2026-07-27 삭제했다. 막대그래프 범위 슬라이더로
   교체하면서 화면에서는 이미 사라졌는데 상수와 상태만 남아, 필터 활성 판정
   (danjiFilterActive)이 그 죽은 키를 보는 바람에 슬라이더가 지도에 전혀
   반영되지 않았다. 판정은 withinSel(RangeSel) 하나로 일원화. */

/** 필터 패널 내 라벨 + 칩 그룹 (모바일 친화 — 줄바꿈 칩) */
function FilterChipGroup({
  label,
  options,
  valueKey,
  onSelect,
}: {
  label: string;
  options: { key: string; label: string }[];
  valueKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-bold text-text-3">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.key === valueKey;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onSelect(o.key)}
              className={`chip whitespace-nowrap px-2.5 py-1.5 text-xs transition-colors ${
                active
                  ? "bg-primary text-white font-bold shadow-[0_2px_8px_rgba(29,79,216,.3)]"
                  : "bg-[rgba(255,255,255,.85)] text-text-2"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 지역(구/시) 실시세 마커 — 서버(region-market)에서 REB 실데이터로 주입 */
export type RegionMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  avgManwon: number;
  perM2Manwon: number | null;
  changePct: number | null;
  tradeCount: number;
  jeonseRatio: number | null;
  period: string;
};

interface MapClientProps {
  danji: DanjiItem[];
  regionLabel: string;
  regionMarkers: RegionMarker[];
  /**
   * 2026-07-26: 서버에서 단지 목록 조회가 **실패**했는지. 예전에는 실패도 빈 배열로
   * 내려와서 좌측 패널이 "수도권 단지 0", 모바일 목록이 "이 지역 단지 목록을 준비
   * 중이에요" 라고 썼다 — 좌표 캐시를 못 읽은 것뿐인데 서비스가 미완성인 것처럼
   * 보인다. 실패는 "—" 와 안내 문구로 구분해서 그린다.
   */
  danjiLoadFailed?: boolean;
  /** 지역 시세 마커 조회가 실패했는지 — 실패면 가격 말풍선이 통째로 빠진다 */
  regionMarkersLoadFailed?: boolean;
  /**
   * `/map?region=서울 마포구` 로 들어왔을 때 처음 비출 지역.
   *
   * 2026-07-27 이전에는 MapPage 가 인자를 하나도 받지 않았다. 그래서 홈·개인화
   * 화면의 "관심지역" 칩(PersonalHome.tsx, HomeResumePanel.tsx)이 무엇을
   * 가리키든 /map 은 늘 같은 수도권 화면을 띄웠다 — 칩이 지역별로 다르게
   * 생겼는데 결과가 같으니, 눌러도 아무 일도 안 일어난 것처럼 보였다.
   * 이름을 legal_regions 좌표로 풀어 서버에서 넘긴다.
   */
  initialFocus?: { name: string; lat: number; lng: number } | null;
  /** 노트→지도 핸드오프 — 단지 패널을 바로 연다 */
  initialComplexFocus?: {
    id: string;
    name: string;
    noteId?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  /** 웰컴/URL 예산 — 가격 슬라이더·거래유형 프리필 (억 단위) */
  initialBudget?: {
    type: "sale" | "jeonse";
    minEok: number | null;
    maxEok: number | null;
    label: string | null;
  } | null;
  /** URL `?type=sale|jeonse|monthly` — 매물 레이어 거래유형 */
  initialListingType?: string | null;
}

/* ===== 서버 클러스터링 (/api/map/clusters) ===== */

interface ClusterItem {
  /** 그리드 셀 키 — 마커 id 의 재료. 없을 수도 있게 둔다(구버전 응답 캐시가
      s-maxage=300 로 최대 5분 살아 있어서, 배포 직후 몇 분은 key 없는 응답이
      온다. 그때 id 가 "cluster:undefined" 로 뭉치면 클러스터가 한 개로
      보이므로, 없으면 예전처럼 좌표로 만든다). */
  key?: string;
  lat: number;
  lng: number;
  count: number;
  /** 셀 실거래 평단가(만원/평) — 매매 실거래가 있는 셀에만 존재 (C1) */
  pyeongManwon?: number;
  /** 그 평단가를 만든 실거래 건수 */
  txCount?: number;
}

/** 만원 → "12.3억" / "8,200만" 라벨 (없으면 null) */
function manwonLabel(manwon: number | undefined): string | null {
  if (manwon === undefined || !Number.isFinite(manwon) || manwon <= 0) return null;
  if (manwon >= 10_000) {
    const eok = manwon / 10_000;
    return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
  }
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

interface ClusterPointItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 단지 실거래 평단가(만원/평) — 매매 실거래가 있는 단지에만 존재 (C1) */
  pyeongManwon?: number;
  /** 그 평단가를 만든 실거래 건수 */
  txCount?: number;
  /** 전세 평균 보증금(만원) — type=rent 요청 시에만 존재 */
  jeonseManwon?: number;
  /** 그 평균을 만든 전세 실거래 건수 */
  jeonseCount?: number;
  /* 상세 필터(범위 슬라이더)용 속성 — /api/map/clusters 가 complex_tx_stats 에서
     실어 보낸다. 모르는 축은 필드가 아예 없다(undefined). */
  avgPriceManwon?: number;
  avgAreaM2?: number;
  buildYear?: number;
  households?: number;
}

/** item9 — 노트 탭에 싣는 그 단지 임장노트 (GET /api/map/complex-notes) */
interface ComplexNoteItem {
  id: string;
  title: string;
  visitDate: string | null;
  region: string | null;
  mine: boolean;
}

/** 매물 탭 — /api/listings?complex= 응답에서 실제로 쓰는 필드만 (PublicListing 부분집합) */
interface ComplexListingItem {
  id: string;
  listingType: "sale" | "jeonse" | "monthly";
  priceKrw: number | null;
  depositKrw: number | null;
  monthlyKrw: number | null;
  areaM2: number | null;
  floor: number | null;
  ownerVerified: boolean;
}

const LISTING_TYPE_LABEL: Record<ComplexListingItem["listingType"], string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};

/** 원(₩) → "12.3억" / "8,200만". 값이 없으면 null — 0 으로 적으면 "0원 매물"이 된다. */
function wonShort(krw: number | null): string | null {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return null;
  if (krw >= 100_000_000) {
    const eok = krw / 100_000_000;
    return `${eok >= 10 ? Math.round(eok) : eok.toFixed(1)}억`;
  }
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
}

/** 매물 가격 라벨 — 유형별로 읽는 컬럼이 다르다 */
function listingPriceLabel(l: ComplexListingItem): string {
  if (l.listingType === "monthly") {
    const dep = wonShort(l.depositKrw) ?? "-";
    const rent = l.monthlyKrw ? Math.round(l.monthlyKrw / 10_000).toLocaleString("ko-KR") : "-";
    return `${dep} / ${rent}만`;
  }
  return wonShort(l.listingType === "sale" ? l.priceKrw : l.depositKrw) ?? "가격 미기재";
}

/** 범례가 "언제 신고된 거래인지"를 말하게 하는 근거 — 서버가 뷰포트 기준으로 계산 */
interface PriceMeta {
  latestYm: number | null;
  txCount: number;
  complexCount: number;
}

const EMPTY_PRICE_META: PriceMeta = { latestYm: null, txCount: 0, complexCount: 0 };

/** 202607 → "2026.07". 값이 없으면 null */
function ymLabel(ym: number | null): string | null {
  if (ym == null || !Number.isFinite(ym)) return null;
  const s = String(Math.trunc(ym));
  if (s.length !== 6) return null;
  return `${s.slice(0, 4)}.${s.slice(4, 6)}`;
}

interface ClustersResponse {
  mode: "clusters" | "points";
  clusters: ClusterItem[];
  points: ClusterPointItem[];
  priceMeta?: PriceMeta;
  /** 포인트 상한(거래량 상위 300)에 걸려 일부 단지가 잘렸는가 */
  truncated?: boolean;
}

/** bounds 변경 → fetch 디바운스(ms) */
const CLUSTER_FETCH_DEBOUNCE_MS = 350;

/* ===== 인기 단지 패널 (/api/map/popular) =====
   예전 좌측 패널은 서버 렌더 때 전국 거래량순 30개를 받아 놓고 그중 한 지역
   이름을 붙여 "수원 단지 30" 이라고 적었다. 목록에 안양·창원·수원이 섞여 있었고
   지도를 움직여도 그대로였다 — 지역 필터가 없었기 때문이다. 이제 지도가 멈출
   때마다 보이는 영역의 인기 단지를 다시 받아 온다. */

/** 이 줌 미만이면 화면이 너무 넓어 "이 지역"이라 부를 수 없다 → 전국 기준으로 조회 */
const POPULAR_NATIONWIDE_MAX_ZOOM = 10;
/** 패널에 표시할 인기 단지 수 (소유자 요청) */
const POPULAR_LIMIT = 10;
/** 지도 idle → 인기 단지 재조회 디바운스(ms) */
const POPULAR_FETCH_DEBOUNCE_MS = 400;

interface PopularItem {
  id: string;
  name: string;
  regionName: string;
  lat: number;
  lng: number;
  recentTradeCount: number;
  tradeCount: number;
  viewCount: number;
  avgPriceManwon: number | null;
  avgAreaM2: number | null;
  buildYear: number | null;
  households: number | null;
}

/* ===== 상세 필터 (막대그래프 슬라이더) =====
   예전 필터는 "5억 이하 / 5~10억" 같은 고정 칩이었고, 무엇보다 서버 렌더 때
   받아 둔 전국 30개에만 적용됐다. 지도를 옮겨도 대상이 그대로라 "이 화면에서
   8억 이하"가 실제로는 "전국 30개 중 8억 이하"였다.
   이제 뷰포트 분포(/api/map/facets)를 막대로 그리고, 손잡이 값을 그대로
   서버 조건으로 넘긴다. */

/** 한 축의 분포 (서버 map_filter_facets 응답) */
interface FacetAxis {
  lo: number | null;
  hi: number | null;
  n: number;
  bins: number[];
}
interface MapFacets {
  total: number;
  buckets: number;
  price: FacetAxis;
  area: FacetAxis;
  year: FacetAxis;
  households: FacetAxis;
}

/** 네 축의 선택 범위. null = 그 끝은 제한 없음 */
type RangeSel = [number | null, number | null];
interface RangeFilters {
  price: RangeSel;
  area: RangeSel;
  year: RangeSel;
  households: RangeSel;
}
const EMPTY_RANGES: RangeFilters = {
  price: [null, null],
  area: [null, null],
  year: [null, null],
  households: [null, null],
};

/** 억 → 만원 (지도 가격 슬라이더 단위) */
function eokToManwon(eok: number | null | undefined): number | null {
  if (eok == null || !Number.isFinite(eok) || eok < 0) return null;
  return Math.round(eok * 10_000);
}

function tradeKeyFromEntry(
  listingType: string | null | undefined,
  budget: MapClientProps["initialBudget"],
): string {
  if (listingType === "sale" || listingType === "jeonse" || listingType === "monthly") {
    return listingType;
  }
  if (budget?.type === "jeonse") return "jeonse";
  if (budget?.type === "sale") return "sale";
  return "all";
}

function rangesFromBudget(budget: MapClientProps["initialBudget"]): RangeFilters {
  if (!budget) return EMPTY_RANGES;
  const min = eokToManwon(budget.minEok);
  const max = eokToManwon(budget.maxEok);
  if (min == null && max == null) return EMPTY_RANGES;
  return { ...EMPTY_RANGES, price: [min, max] };
}

/**
 * 값이 선택 범위 안인가.
 *
 * 값을 모르는 단지(null)는 **제외**한다. 슬라이더를 "2010년 이후"로 좁혔는데
 * 준공연도를 모르는 단지가 결과에 남아 있으면, 사용자는 그걸 조건을 만족한
 * 단지로 읽는다. 우리는 그걸 확인한 적이 없다. 다만 축 자체에 손을 안 댔으면
 * (양끝 모두 null) 아무것도 거르지 않는다 — 그때는 모르는 값도 그대로 둔다.
 */
function withinSel(value: number | null, sel: RangeSel): boolean {
  const [min, max] = sel;
  if (min === null && max === null) return true;
  if (value === null || !Number.isFinite(value)) return false;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

/** 만원 → "12.3억" / "8,200만" */
function manwonShort(manwon: number): string {
  if (manwon >= 10_000) {
    const eok = manwon / 10_000;
    return `${eok >= 10 ? Math.round(eok) : eok.toFixed(1)}억`;
  }
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

/* ===== 매물 레이어 (/api/map/listings) — 유저 등록 매물을 지도 마커로 ===== */

interface MapListingItem {
  id: string;
  lat: number;
  lng: number;
  priceLabel: string;
  listingType: "sale" | "jeonse" | "monthly";
  boosted: boolean;
  propertyKind?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  parkingSpaces?: number | null;
}

/** listing_type → 한글 라벨 (서버 모듈 import 없이 클라이언트 로컬) */
const LISTING_TYPE_LABEL_MAP: Record<MapListingItem["listingType"], string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};

/** 매물 마커 전용 색 — 회색 단지 시세 마커와 시각적으로 구분 */
const LISTING_MARKER_COLOR = "#1d4fd8";
/** 전세(평균 보증금) 마커 색 — 매매 평단가 색상 티어와 구분되는 단일 색 */
const JEONSE_MARKER_COLOR = "#177a4a";
/** 매물 bounds fetch 디바운스(ms) */
const LISTING_FETCH_DEBOUNCE_MS = 350;

/* 지도 편의 레이어(지하철/학교/마트 POI)는 사실 우선 원칙에 따라 제거했다.
   lib/listings/poi.ts 가 구 중심 좌표를 시드로 역·학교·마트를 지어내고 있었다.
   실존 노선명(2·3·5·7·9호선·신분당선·GTX-A)과 실존 체인(이마트·홈플러스·
   롯데마트·코스트코·하나로마트)을 붙인 마커를 지도 위 임의 좌표에 찍었고,
   nearestSubway() 는 그 가짜 좌표로 "도보 N분"까지 계산했다. 실재하지 않는
   역·마트를 보고 임장 동선을 짜게 되는 종류의 오류라 레이어째 걷어냈다.
   실제 교통·학군·상권 소스(서울열린데이터광장 등)가 연결되면 다시 세운다. */

/* ===== 출퇴근 필터 (#10) — 회사 위치 기준 예상 소요시간 ===== */
const COMMUTE_OPTIONS: { key: string; label: string; max: number | null }[] = [
  { key: "off", label: "해제", max: null },
  { key: "30", label: "≤30분", max: 30 },
  { key: "45", label: "≤45분", max: 45 },
  { key: "60", label: "≤60분", max: 60 },
];
/** 출퇴근 추정 요청 단지 수 상한(서버와 별개의 클라 가드) */
const COMMUTE_MAX_POINTS = 60;

interface CommuteResponse {
  office: { lat: number; lng: number } | null;
  basis: "directions" | "haversine";
  results: { id: string; minutes: number }[];
  note?: string;
  error?: string;
}

/** 두 좌표 간 거리(m) — 하버사인. C3 반경 필터용. */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** C3 반경 프리셋(m) */
const RADIUS_PRESETS = [300, 500, 1000, 2000, 3000] as const;

/** 거리 표기 — 1km 미만은 m, 그 이상은 소수 둘째 자리 km. */
function formatDistanceM(m: number): string {
  if (!Number.isFinite(m) || m < 0) return "—";
  if (m < 1000) return `${Math.round(m).toLocaleString("ko-KR")}m`;
  return `${(m / 1000).toFixed(2)}km`;
}

export function MapClient({
  danji,
  regionLabel,
  regionMarkers,
  danjiLoadFailed = false,
  regionMarkersLoadFailed = false,
  initialFocus = null,
  initialComplexFocus = null,
  initialBudget = null,
  initialListingType = null,
}: MapClientProps) {
  const focusedRegion = initialFocus?.name ?? null;
  const hasEntryFocus = Boolean(initialFocus || initialComplexFocus);
  const [zoom, setZoom] = useState<Zoom>(
    hasEntryFocus || danji.length > 0 ? "danji" : "city",
  );
  const [level, setLevel] = useState<number>(
    hasEntryFocus || danji.length > 0 ? LEVEL_BY_ZOOM.danji : LEVEL_BY_ZOOM.city,
  );
  const [panelOpen, setPanelOpen] = useState(true);
  /* 모바일 지도↔목록 전환 — 데스크탑은 좌측 목록 패널이 항상 있지만 모바일은
     지도뿐이었다. 저사양 기기·지도 로드 실패 시 대안이 없고, 목록으로 훑고
     싶은 사용자도 있다. "list"면 지도 위에 전체 화면 목록을 덮는다. */
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("요약");
  const [center, setCenter] = useState(() => {
    // ?region= 으로 지목된 지역이 있으면 그 좌표가 최우선이다.
    if (initialFocus) return { lat: initialFocus.lat, lng: initialFocus.lng };
    if (
      initialComplexFocus?.lat != null &&
      initialComplexFocus?.lng != null &&
      Number.isFinite(initialComplexFocus.lat) &&
      Number.isFinite(initialComplexFocus.lng)
    ) {
      return { lat: initialComplexFocus.lat, lng: initialComplexFocus.lng };
    }
    const focusDanji = initialComplexFocus
      ? danji.find((d) => d.id === initialComplexFocus.id)
      : null;
    if (focusDanji) return { lat: focusDanji.lat, lng: focusDanji.lng };
    if (danji.length > 0) {
      const lat = danji.reduce((s, d) => s + d.lat, 0) / danji.length;
      const lng = danji.reduce((s, d) => s + d.lng, 0) / danji.length;
      return { lat, lng };
    }
    // 단지 좌표가 없으면 지역 시세 마커 중심(수도권) — 서울 시청 근방
    return { lat: 37.5665, lng: 126.978 };
  });

  /* ===== 지도 진입 시 현재 위치로 맞추기 =====
     예전에는 늘 단지 좌표 평균(사실상 수도권 어딘가)에서 시작했다. 처음 들어온
     사람은 자기 동네를 직접 찾아 들어가야 했다.

     세 가지를 지킨다.
       · ?region=·complexId·noteId 로 지목된 목적지가 있으면 그쪽이 우선이다.
       · 한 번만 시도한다. 지도를 옮긴 뒤 다시 끌려가면 안 된다.
       · 국내 대략 범위 밖 좌표는 버린다. VPN·기기 오차로 태평양 한복판을 잡으면
         단지가 하나도 없는 빈 지도가 되어 "고장" 처럼 보인다.
     거부하거나 실패하면 조용히 기존 시작 위치를 쓴다. */
  const [geoApplied, setGeoApplied] = useState(false);
  const geoTriedRef = useRef(false);
  useEffect(() => {
    if (hasEntryFocus) return;
    if (geoTriedRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    geoTriedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        if (latitude < 32.5 || latitude > 39.5 || longitude < 124 || longitude > 132.5) return;
        setCenter({ lat: latitude, lng: longitude });
        setZoom("danji");
        setLevel(LEVEL_BY_ZOOM.danji);
        setGeoApplied(true);
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 },
    );
  }, [hasEntryFocus]);

  // 위치로 맞췄다는 안내는 잠깐만 — 지도 위에 계속 떠 있을 이유가 없다.
  useEffect(() => {
    if (!geoApplied) return;
    const t = setTimeout(() => setGeoApplied(false), 4_000);
    return () => clearTimeout(t);
  }, [geoApplied]);

  /* 줌 단계 탭 선택 — 지도 위 플로팅 탭과 헤더 탭(xl+)이 같은 동작을 쓴다.
     두 렌더 자리가 각자 onClick 을 들고 있으면 언젠가 한쪽만 고쳐진다. */
  const handleZoomTab = (k: Zoom) => {
    setZoom(k);
    setLevel(LEVEL_BY_ZOOM[k]);
    setSelectedId(null);
    setInfoComplex(null);
    setSearchMarker(null);
  };

  const selected = danji.find((d) => d.id === selectedId) ?? null;

  /* ===== 검색 선택 · 단지 정보 패널 (item1·item2) =====
     infoComplex: 목록 밖 단지(검색/포인트)용 정보 패널 대상.
     searchMarker: 목록 밖 단지를 지도에 하이라이트하기 위한 임시 마커. */
  const [infoComplex, setInfoComplex] = useState<{ id: string; name: string } | null>(
    () =>
      initialComplexFocus
        ? { id: initialComplexFocus.id, name: initialComplexFocus.name }
        : null,
  );
  const [searchMarker, setSearchMarker] = useState<
    { id: string; name: string; lat: number; lng: number } | null
  >(() => {
    if (!initialComplexFocus) return null;
    if (
      initialComplexFocus.lat != null &&
      initialComplexFocus.lng != null &&
      Number.isFinite(initialComplexFocus.lat) &&
      Number.isFinite(initialComplexFocus.lng)
    ) {
      return {
        id: initialComplexFocus.id,
        name: initialComplexFocus.name,
        lat: initialComplexFocus.lat,
        lng: initialComplexFocus.lng,
      };
    }
    const d = danji.find((x) => x.id === initialComplexFocus.id);
    return d
      ? { id: d.id, name: d.name, lat: d.lat, lng: d.lng }
      : null;
  });
  const [focusNoteId] = useState<string | null>(
    () => initialComplexFocus?.noteId ?? null,
  );
  const complexFocusAppliedRef = useRef(false);

  /* 노트→지도: 단지 패널·줌을 한 번만 맞춘다 (ComplexInfoPanel onLoaded 가 좌표를 보강) */
  useEffect(() => {
    if (!initialComplexFocus || complexFocusAppliedRef.current) return;
    complexFocusAppliedRef.current = true;
    setZoom("danji");
    setLevel(LEVEL_BY_ZOOM.danji);
    setInfoComplex({
      id: initialComplexFocus.id,
      name: initialComplexFocus.name,
    });
    const d = danji.find((x) => x.id === initialComplexFocus.id);
    if (d && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
      setSearchMarker({ id: d.id, name: d.name, lat: d.lat, lng: d.lng });
      setCenter({ lat: d.lat, lng: d.lng });
    } else if (
      initialComplexFocus.lat != null &&
      initialComplexFocus.lng != null &&
      Number.isFinite(initialComplexFocus.lat) &&
      Number.isFinite(initialComplexFocus.lng)
    ) {
      setSearchMarker({
        id: initialComplexFocus.id,
        name: initialComplexFocus.name,
        lat: initialComplexFocus.lat,
        lng: initialComplexFocus.lng,
      });
      setCenter({
        lat: initialComplexFocus.lat,
        lng: initialComplexFocus.lng,
      });
    }
    void fetch("/api/map/focus-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        complexId: initialComplexFocus.id,
        noteId: initialComplexFocus.noteId ?? null,
      }),
    }).catch(() => undefined);
  }, [initialComplexFocus, danji]);

  /* ===== 매물 레이어 상태 — 토글 ON일 때만 현재 뷰포트 매물을 마커로 ===== */
  const [showListings, setShowListings] = useState(
    () =>
      initialListingType === "sale" ||
      initialListingType === "jeonse" ||
      initialListingType === "monthly",
  );
  const [listingFetchStatus, setListingFetchStatus] = useState<
    "idle" | "ok" | "error"
  >("idle");
  /* ===== C3 반경 그리기 =====
     예전에는 중심이 늘 "지도 중심"이었다. 그래서 어떤 단지 주변 500m를 보려면
     그 단지가 화면 정중앙에 오도록 지도를 밀어야 했고, 필터를 만지는 동안 지도가
     계속 움직여 원도 같이 따라다녔다. 이제 지도를 클릭한 지점이 중심이 된다.
     radiusCenter 가 null 이면 아직 안 찍은 것 — 그때만 지도 중심으로 대신한다. */
  const [radiusMode, setRadiusMode] = useState(false);
  const [radiusM, setRadiusM] = useState<number>(1000);
  const [radiusCenter, setRadiusCenter] = useState<{ lat: number; lng: number } | null>(null);

  /* ===== 거리 재기 =====
     지점을 차례로 찍으면 직선으로 잇고 구간·누적 거리를 보여 준다.
     드래그·선택 삭제·수정, 차량/도보 점선 경로까지 지원. */
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<{ lat: number; lng: number }[]>([]);
  const [selectedMeasureIdx, setSelectedMeasureIdx] = useState<number | null>(null);
  /** 수정 모드 — 다음 지도 클릭이 선택 지점을 이동 */
  const [measureRelocate, setMeasureRelocate] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<{
    straightM: number;
    driving: {
      distanceM: number;
      durationMin: number;
      path: { lat: number; lng: number }[];
      basis: string;
    } | null;
    walking: {
      distanceM: number;
      durationMin: number;
      path: { lat: number; lng: number }[];
      basis: string;
    } | null;
  } | null>(null);
  const [showDrivingRoute, setShowDrivingRoute] = useState(true);
  const [showWalkingRoute, setShowWalkingRoute] = useState(true);
  const [listingItems, setListingItems] = useState<MapListingItem[]>([]);

  /* ===== 가격대·면적대·준공연도 필터 상태 (확대 · item3) =====
     세대수·유형은 실데이터 소스가 없어 필터에서 제외 — 패널에 "데이터 준비 중"으로 표시 */
  /** 거래유형(매물 레이어) — /api/map/listings?type= 로 서버 재조회 */
  const [listingTradeKey, setListingTradeKey] = useState(() =>
    tradeKeyFromEntry(initialListingType, initialBudget),
  );
  /** 매물 상세 필터 — 유형·방·화장실·주차 (등록 매물 기준) */
  const [propertyKindKey, setPropertyKindKey] = useState("all");
  /** API가 상세 컬럼 폴백이면 false — 칩은 유지하되 안내 문구로 정직하게 */
  const [detailFiltersSupported, setDetailFiltersSupported] = useState(true);
  const [roomsKey, setRoomsKey] = useState("all");
  const [bathroomsKey, setBathroomsKey] = useState("all");
  const [parkingKey, setParkingKey] = useState("all");
  /* URL로 type/가격이 온 경우만 필터 패널을 연다 — 로그인 preferences 조용 프리필은 패널을 강제하지 않음 */
  const [filtersExpanded, setFiltersExpanded] = useState(() =>
    Boolean(initialListingType),
  );

  /* 하단 카테고리 바가 실제로 차지하는 높이를 재서 --nz-map-nav-h 로 내보낸다.
     예전에는 예약 레인이 "51px 이겠지"라는 손으로 적은 숫자였고, 폰트가 바뀌거나
     글자가 한 줄 늘어나는 순간(768폭에서 실제로 71px 이었다) 그 숫자만 조용히
     틀려서 좌우 범례가 전부 바에 깔렸다. 낡은 실측치는 낡은 코드보다 위험하다 —
     그러니 짐작하지 말고 매번 잰다. */
  const mapNavRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = mapNavRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const publish = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty("--nz-map-nav-h", `${h}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      /* 지도를 떠나면 값을 지운다 — 다른 화면이 이 토큰을 참조하게 되면
         지도에만 있는 바의 높이가 남의 레이아웃을 흔든다. */
      document.documentElement.style.removeProperty("--nz-map-nav-h");
    };
  }, []);

  /* 상세 필터 — 뷰포트 분포(막대그래프)와 선택 범위 */
  const [facets, setFacets] = useState<MapFacets | null>(null);
  const [ranges, setRanges] = useState<RangeFilters>(() => rangesFromBudget(initialBudget));
  const facetsAbortRef = useRef<AbortController | null>(null);
  /* 최신 범위를 콜백 재생성 없이 참조 — 지도 idle 때마다 콜백을 다시 만들면
     디바운스 타이머가 매번 초기화돼 조회가 밀린다. */
  const rangesRef = useRef(ranges);
  rangesRef.current = ranges;

  const rangeActive =
    ranges.price[0] !== null || ranges.price[1] !== null ||
    ranges.area[0] !== null || ranges.area[1] !== null ||
    ranges.year[0] !== null || ranges.year[1] !== null ||
    ranges.households[0] !== null || ranges.households[1] !== null;
  /** 실거래 거래유형 토글 — 매매(trade) / 전세(rent, 평균 보증금). /api/map/clusters?type= */
  const [txType, setTxType] = useState<"trade" | "rent">(() =>
    tradeKeyFromEntry(initialListingType, initialBudget) === "jeonse" ? "rent" : "trade",
  );
  /** 모바일 접이식 범례 (item7) — 기본 접힘 */
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);

  /* ===== C1 시세 색상 오버레이 =====
     한때 있던 히트맵(#A2)은 구 단위 평균이 하드코딩 목업이라 사실 우선 원칙에 따라 걷어냈다.
     그 자리를 국토교통부 실거래(매매) 평단가로 다시 채운 것이 이 오버레이다.
     색은 lib/map/price-tiers.ts 의 전국 공통 절대 구간을 따르고, 거래가 없는 칸은
     색 대신 회색 + "데이터 없음"으로 남긴다. 끄면 예전처럼 개수만 보인다. */
  const [showPriceOverlay, setShowPriceOverlay] = useState(true);

  /* ===== 정비사업 레이어 — 재개발·재건축 사업장 (공개 자료). 토글 ON 시 1회 로드 ===== */
  const [showRedevelopment, setShowRedevelopment] = useState(false);

  /* 레이어·거래유형 선택 유지 — 예전엔 방문마다 전부 초기화됐다(localStorage 사용처가
     코치마크 한 줄뿐이었다). URL 이 명시한 값(?type= → 매물 ON)은 저장값보다 우선.
     초기값 대신 mount effect 로 복원하는 이유: 클라이언트 컴포넌트도 SSR 되므로
     useState 초기화에서 localStorage 를 읽으면 하이드레이션이 어긋난다. */
  const mapPrefsLoaded = useRef(false);
  useEffect(() => {
    if (mapPrefsLoaded.current) return;
    mapPrefsLoaded.current = true;
    try {
      const raw = window.localStorage.getItem("nz_map_prefs");
      if (!raw) return;
      const p = JSON.parse(raw) as {
        overlay?: boolean;
        listings?: boolean;
        redev?: boolean;
        tx?: "trade" | "rent";
      };
      if (typeof p.overlay === "boolean") setShowPriceOverlay(p.overlay);
      // URL 로 매물이 켜진 진입(?type=)은 사용자의 명시 의도 — 저장값이 끄지 않는다
      if (typeof p.listings === "boolean" && !initialListingType) setShowListings(p.listings);
      if (typeof p.redev === "boolean") setShowRedevelopment(p.redev);
      if ((p.tx === "trade" || p.tx === "rent") && !initialListingType) setTxType(p.tx);
    } catch {
      /* 손상된 저장값은 무시 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!mapPrefsLoaded.current) return;
    try {
      window.localStorage.setItem(
        "nz_map_prefs",
        JSON.stringify({
          overlay: showPriceOverlay,
          listings: showListings,
          redev: showRedevelopment,
          tx: txType,
        }),
      );
    } catch {
      /* 프라이빗 모드 등 — 유지 없이 진행 */
    }
  }, [showPriceOverlay, showListings, showRedevelopment, txType]);
  const [redevItems, setRedevItems] = useState<RedevelopmentProject[]>([]);
  /* 조회 실패와 "정말 0건"은 지도에서 똑같이 보인다 — 둘 다 마커가 없다.
     그래서 실패는 따로 들고 있다가 말로 알린다. */
  const [redevFailed, setRedevFailed] = useState(false);

  /* ===== 매물 미리보기 패널 — 매물 마커 클릭 시 하단 시트로 미리보기(이탈 없이) ===== */
  const [listingPreviewId, setListingPreviewId] = useState<string | null>(null);

  /* ===== 출퇴근 필터 (#10) 상태 ===== */
  const [officeInput, setOfficeInput] = useState("");
  const [officeQuery, setOfficeQuery] = useState(""); // 적용된 회사 주소(제출값)
  const [commuteKey, setCommuteKey] = useState("off");
  const [commuteMinutes, setCommuteMinutes] = useState<Map<string, number> | null>(null);
  const [commuteBasis, setCommuteBasis] = useState<"directions" | "haversine" | null>(null);
  const [commuteOfficeResolved, setCommuteOfficeResolved] = useState(false);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);
  const commuteAbortRef = useRef<AbortController | null>(null);
  const commuteThreshold = COMMUTE_OPTIONS.find((o) => o.key === commuteKey)?.max ?? null;
  const commuteActive =
    commuteThreshold !== null && commuteOfficeResolved && commuteMinutes !== null;

  const listingDetailFilterActive =
    propertyKindKey !== "all" ||
    roomsKey !== "all" ||
    bathroomsKey !== "all" ||
    parkingKey !== "all";
  const filterActive =
    rangeActive ||
    listingTradeKey !== "all" ||
    listingDetailFilterActive ||
    commuteKey !== "off";
  const activeCount =
    [listingTradeKey, propertyKindKey, roomsKey, bathroomsKey, parkingKey, commuteKey].filter(
      (k) => k !== "all" && k !== "off",
    ).length +
    (["price", "area", "year", "households"] as const).filter(
      (k) => ranges[k][0] !== null || ranges[k][1] !== null,
    ).length;

  const resetFilters = useCallback(() => {
    setRanges(EMPTY_RANGES);
    setListingTradeKey("all");
    setPropertyKindKey("all");
    setRoomsKey("all");
    setBathroomsKey("all");
    setParkingKey("all");
    setCommuteKey("off");
  }, []);

  /* 범위 슬라이더를 적용한 단지 (출퇴근 추정 요청·비교의 기준 집합).
     ── 2026-07-27: 여기가 통째로 죽어 있었다 ────────────────────────────────
     예전 코드는 `if (!danjiFilterActive) return danji;` 로 시작했고,
     danjiFilterActive 는 priceKey/areaKey/yearKey 로 계산했다. 그런데 그 세
     키를 쓰던 고정 칩(FilterChipGroup + PRICE_OPTIONS…)은 막대그래프 슬라이더로
     교체하면서 화면에서 사라졌다. 남은 setter 는 resetFilters 뿐이라 세 키는
     영원히 "all" 이었고, 따라서 danjiFilterActive 는 영원히 false,
     rangeFilteredDanji === danji 였다.
     결과: 슬라이더를 아무리 끌어도 지도 마커도, 모바일 목록도, "단지 N 적용"
     숫자도 하나도 안 변했다. 좌측 인기 단지 패널만 서버(/api/map/popular)로
     범위를 보내고 있어서 그쪽만 반응하는 바람에 더 헷갈렸다.
     이제 ranges 를 직접 본다.

     단위: 슬라이더 값은 facets 와 같은 만원 단위(map_filter_facets 가 만원으로
     준다). DanjiItem.avgPriceWon 은 원이라 10,000 으로 나눠 맞춘다. */
  /* C7 densify — SSR 전국 top-N 시드에 뷰포트 인기 단지를 합쳐 좌측 목록이
     지도를 따라가게 한다. 마커(/api/map/clusters)는 이미 뷰포트 기준이다. */
  const [viewportDanji, setViewportDanji] = useState<DanjiItem[]>([]);
  /* 뷰포트 인기 목록이 채워진 동안은 전국 SSR 시드를 쓰지 않는다.
     (nationwide 로 돌아갈 때 viewportDanji 를 비워 시드로 복귀) */
  const densifiedDanji = useMemo(() => {
    if (viewportDanji.length > 0) return viewportDanji;
    return danji;
  }, [danji, viewportDanji]);

  const rangeFilteredDanji = useMemo(() => {
    if (!rangeActive) return densifiedDanji;
    return densifiedDanji.filter(
      (d) =>
        withinSel(d.avgPriceWon !== null ? d.avgPriceWon / 10_000 : null, ranges.price) &&
        withinSel(d.areaM2, ranges.area) &&
        withinSel(d.buildYear, ranges.year) &&
        withinSel(d.households, ranges.households),
    );
  }, [densifiedDanji, rangeActive, ranges]);

  // 출퇴근(#10) 필터를 범위 필터 위에 덧입힘 — 임계 초과 단지는 숨김.
  const filteredDanji = useMemo(() => {
    if (!commuteActive || commuteMinutes === null || commuteThreshold === null) {
      return rangeFilteredDanji;
    }
    return rangeFilteredDanji.filter((d) => {
      const m = commuteMinutes.get(d.id);
      return m !== undefined && m <= commuteThreshold;
    });
  }, [rangeFilteredDanji, commuteActive, commuteMinutes, commuteThreshold]);

  /* ===== 마커 호버 요약 =====
     누르기 전에는 지도에서 값 하나(또는 이름 하나)밖에 알 수 없었다. 그래서 여러
     단지를 견주려면 하나씩 눌러 패널을 열었다 닫기를 반복해야 했다. 커서를 올리면
     세대수·준공연도·평균 전용면적까지 같이 보여, 그 비교가 지도 위에서 끝나게 한다.
     위치는 포인터를 그대로 따라간다 — 지도 투영 좌표 변환을 거치지 않아 어긋나지 않는다. */
  const [hoverMarker, setHoverMarker] = useState<MapMarkerData | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  const handleMarkerHover = useCallback((m: MapMarkerData | null) => {
    setHoverMarker(m);
    if (!m) setHoverPos(null);
  }, []);

  useEffect(() => {
    if (!hoverMarker) return;
    const el = mapWrapRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      setHoverPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, [hoverMarker]);

  /* 반경 원의 실제 중심 — 찍은 지점이 있으면 그것, 없으면 지도 중심. */
  const radiusOrigin = radiusCenter ?? center;

  /* ===== 필터 패널 가로 위치 =====
     필터 패널은 좌측 상단에 고정돼 있었다. 그런데 같은 자리에 단지 정보(380px)·
     단지 상세(460px)·인기 단지(320px) 패널이 뜬다. 그래서 단지를 열어 둔 채
     "필터"를 누르면 두 카드가 포개져 글자가 서로 비쳐 보였다(소유자 지적).

     좌측 패널(인기 단지, 320px)의 오른쪽 끝을 계산해 그 옆으로 민다. 좁은 화면에서
     밀린 만큼 폭이 모자라지 않도록 max-width 도 같은 값으로 함께 줄인다.
     단지 상세·단지 정보는 이제 가운데 팝업이라 애초에 이 자리를 다투지 않는다.

     좌측 패널의 오른쪽 끝은 340px 인데 접기 핸들 ‹ 이 340~356 에 반쯤 걸쳐 있다.
     그래서 352 를 쓰면 패널이 핸들의 오른쪽 4px 을 덮어 핸들이 반만 눌린다
     (1280폭 실측 4×64px). 364 = 356 + 8 로 핸들 바깥에 세운다. */
  const leftPanelEdgePx = !selected && !infoComplex && panelOpen ? 364 : 0;
  const filterLeftMdPx = Math.max(364, leftPanelEdgePx);
  const filterLeftLgPx = Math.max(200, leftPanelEdgePx);

  /* 거리 재기 — 각 지점의 누적 거리 라벨과 구간 목록. */
  const measureLegs = useMemo(() => {
    const legs: { from: number; to: number; meters: number }[] = [];
    for (let i = 1; i < measurePoints.length; i += 1) {
      const a = measurePoints[i - 1];
      const b = measurePoints[i];
      legs.push({ from: i, to: i + 1, meters: haversineM(a.lat, a.lng, b.lat, b.lng) });
    }
    return legs;
  }, [measurePoints]);

  const measureTotalM = useMemo(
    () => measureLegs.reduce((s, l) => s + l.meters, 0),
    [measureLegs],
  );

  /* 첫 지점과 마지막 지점을 바로 잇는 직선거리 — 꺾어 잰 합계와 다르다.
     "역까지 실제로 몇 m냐"를 물을 때 필요한 건 이쪽인 경우가 많다. */
  const measureStraightM = useMemo(() => {
    if (measurePoints.length < 2) return 0;
    const a = measurePoints[0];
    const b = measurePoints[measurePoints.length - 1];
    return haversineM(a.lat, a.lng, b.lat, b.lng);
  }, [measurePoints]);

  const measurePath = useMemo(() => {
    if (!measureMode || measurePoints.length === 0) return null;
    let acc = 0;
    return measurePoints.map((p, i) => {
      if (i > 0) {
        const prev = measurePoints[i - 1];
        acc += haversineM(prev.lat, prev.lng, p.lat, p.lng);
      }
      return {
        ...p,
        label: i === 0 ? "시작" : formatDistanceM(acc),
        selected: selectedMeasureIdx === i,
      };
    });
  }, [measureMode, measurePoints, selectedMeasureIdx]);

  const routeOverlays = useMemo(() => {
    if (!measureMode || !routeResult) return null;
    const out: {
      id: string;
      path: { lat: number; lng: number }[];
      color: string;
      dashed?: boolean;
      strokeWeight?: number;
      strokeOpacity?: number;
    }[] = [];
    if (showDrivingRoute && routeResult.driving?.path?.length) {
      out.push({
        id: "driving",
        path: routeResult.driving.path,
        color: "#e67e22",
        dashed: true,
        strokeWeight: 3.5,
        strokeOpacity: 0.9,
      });
    }
    if (showWalkingRoute && routeResult.walking?.path?.length) {
      out.push({
        id: "walking",
        path: routeResult.walking.path,
        color: "#0d9488",
        dashed: true,
        strokeWeight: 3,
        strokeOpacity: 0.85,
      });
    }
    return out.length ? out : null;
  }, [measureMode, routeResult, showDrivingRoute, showWalkingRoute]);

  /* 시작·끝 바뀌면 차량/도보 경로 재조회 */
  useEffect(() => {
    if (!measureMode || measurePoints.length < 2) {
      setRouteResult(null);
      setRouteError(null);
      setRouteLoading(false);
      return;
    }
    const start = measurePoints[0];
    const goal = measurePoints[measurePoints.length - 1];
    const controller = new AbortController();
    setRouteLoading(true);
    setRouteError(null);
    const t = window.setTimeout(() => {
      fetch("/api/map/route-measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, goal }),
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j) {
            setRouteError("경로를 불러오지 못했어요");
            setRouteResult(null);
            return;
          }
          setRouteResult({
            straightM: Number(j.straight?.distanceM) || 0,
            driving: j.driving
              ? {
                  distanceM: Number(j.driving.distanceM),
                  durationMin: Number(j.driving.durationMin),
                  path: Array.isArray(j.driving.path) ? j.driving.path : [],
                  basis: String(j.driving.basis ?? "directions"),
                }
              : null,
            walking: j.walking
              ? {
                  distanceM: Number(j.walking.distanceM),
                  durationMin: Number(j.walking.durationMin),
                  path: Array.isArray(j.walking.path) ? j.walking.path : [],
                  basis: String(j.walking.basis ?? "estimate"),
                }
              : null,
          });
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setRouteError("경로 조회에 실패했어요");
        })
        .finally(() => setRouteLoading(false));
    }, 280);
    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [measureMode, measurePoints]);

  /* 지도 클릭 — 거리 재기가 켜져 있으면 지점 추가/수정, 반경 모드면 중심 이동. */
  const mapClickMode: "measure" | "radius" | null = measureMode
    ? "measure"
    : radiusMode
      ? "radius"
      : null;

  const handleMapClick = useCallback(
    (p: { lat: number; lng: number }) => {
      if (measureMode) {
        if (measureRelocate && selectedMeasureIdx != null) {
          setMeasurePoints((prev) =>
            prev.map((pt, i) => (i === selectedMeasureIdx ? p : pt)),
          );
          setMeasureRelocate(false);
          return;
        }
        setMeasurePoints((prev) => [...prev, p]);
        setSelectedMeasureIdx(null);
        return;
      }
      if (radiusMode) setRadiusCenter(p);
    },
    [measureMode, radiusMode, measureRelocate, selectedMeasureIdx],
  );

  const deleteSelectedMeasurePoint = useCallback(() => {
    if (selectedMeasureIdx == null) return;
    setMeasurePoints((prev) => prev.filter((_, i) => i !== selectedMeasureIdx));
    setSelectedMeasureIdx(null);
    setMeasureRelocate(false);
  }, [selectedMeasureIdx]);

  const openExternalDirections = useCallback(
    (mode: "car" | "walk") => {
      if (measurePoints.length < 2) return;
      const a = measurePoints[0];
      const b = measurePoints[measurePoints.length - 1];
      /* 네이버지도 길찾기 URL — 앱/웹이 처리 */
      const url = `https://map.naver.com/v5/directions/${a.lng},${a.lat},출발지,,,,/${b.lng},${b.lat},도착지,,,,/-/${mode === "walk" ? "walk" : "car"}`;
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [measurePoints],
  );

  const copyMeasureSummary = useCallback(async () => {
    if (measurePoints.length < 2) return;
    const lines = [
      `직선 ${formatDistanceM(measureStraightM)}`,
      routeResult?.driving
        ? `차량 ${formatDistanceM(routeResult.driving.distanceM)} · 약 ${routeResult.driving.durationMin}분`
        : null,
      routeResult?.walking
        ? `도보 추정 ${formatDistanceM(routeResult.walking.distanceM)} · 약 ${routeResult.walking.durationMin}분`
        : null,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
    } catch {
      /* 클립보드 불가 — 조용히 무시 */
    }
  }, [measurePoints.length, measureStraightM, routeResult]);

  /** 상단 매매/전세/월세 강조 — 월세는 매물 레이어, 매매·전세는 실거래+매물 유형 */
  const topTradeKey =
    listingTradeKey === "monthly"
      ? "monthly"
      : txType === "rent"
        ? "jeonse"
        : "sale";

  // 컴팩트 칩 행: 매매/전세/월세 + 매물 + 필터 …
  const filterBar = (
    <>
      {(
        [
          { key: "sale", label: "매매" },
          { key: "jeonse", label: "전세" },
          { key: "monthly", label: "월세" },
        ] as const
      ).map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={topTradeKey === t.key}
          onClick={() => {
            if (t.key === "monthly") {
              setListingTradeKey("monthly");
              setShowListings(true);
              return;
            }
            setTxType(t.key === "jeonse" ? "rent" : "trade");
            setListingTradeKey(t.key);
          }}
          className={`chip whitespace-nowrap px-3 py-1.5 text-xs font-bold transition-colors ${
            topTradeKey === t.key
              ? "chip-active"
              : "bg-[rgba(255,255,255,.75)] text-text-2"
          }`}
        >
          {t.label}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={showListings}
        onClick={() => setShowListings((v) => !v)}
        className={`chip whitespace-nowrap px-3 py-1.5 text-xs font-bold transition-colors ${
          showListings
            ? "bg-primary text-white shadow-[0_4px_12px_rgba(29,79,216,.35)]"
            : "bg-[rgba(255,255,255,.75)] text-text-2"
        }`}
      >
        <Icon name="🏠" size={14} className="inline align-middle" /> 매물
      </button>
      <button
        type="button"
        aria-expanded={filtersExpanded}
        data-tour="map-filter"
        onClick={() =>
          setFiltersExpanded((v) => {
            const next = !v;
            if (next) {
              setSelectedId(null);
              setInfoComplex(null);
            }
            return next;
          })
        }
        className={`chip whitespace-nowrap px-3 py-1.5 text-xs font-bold transition-colors ${
          filterActive || filtersExpanded
            ? "bg-[rgba(29,79,216,.12)] text-primary"
            : "bg-[rgba(255,255,255,.75)] text-text-2"
        }`}
      >
        필터
        {activeCount > 0 && (
          <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-white">
            {activeCount}
          </span>
        )}{" "}
        ▾
      </button>
      {filterActive && (
        <button
          type="button"
          onClick={resetFilters}
          className="whitespace-nowrap text-[11px] font-bold text-text-3 underline"
        >
          초기화
        </button>
      )}
      {/* C3 반경 필터 토글 + 프리셋 */}
      <button
        type="button"
        aria-pressed={radiusMode}
        onClick={() =>
          setRadiusMode((v) => {
            const next = !v;
            // 켤 때는 거리 재기를 끈다 — 클릭 한 번이 두 뜻을 가질 수 없다.
            if (next) {
              setMeasureMode(false);
              setMeasurePoints([]);
              setSelectedMeasureIdx(null);
              setMeasureRelocate(false);
            } else setRadiusCenter(null);
            return next;
          })
        }
        className={`chip whitespace-nowrap px-3 py-1.5 text-xs font-bold transition-colors ${
          radiusMode
            ? "bg-primary text-white shadow-[0_4px_12px_rgba(29,79,216,.35)]"
            : "bg-[rgba(255,255,255,.75)] text-text-2"
        }`}
      >
        ◎ 반경
      </button>
      {radiusMode &&
        RADIUS_PRESETS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRadiusM(r)}
            className={`chip whitespace-nowrap px-2.5 py-1.5 text-xs font-bold transition-colors ${
              radiusM === r
                ? "bg-[rgba(29,79,216,.12)] text-primary"
                : "bg-[rgba(255,255,255,.75)] text-text-2"
            }`}
          >
            {r >= 1000 ? `${r / 1000}km` : `${r}m`}
          </button>
        ))}
      {radiusMode && radiusCenter && (
        <button
          type="button"
          onClick={() => setRadiusCenter(null)}
          className="whitespace-nowrap text-[11px] font-bold text-text-3 underline"
        >
          중심 해제
        </button>
      )}
      {/* 거리 재기 — 지점을 찍어 직선거리를 잰다 */}
      <button
        type="button"
        aria-pressed={measureMode}
        onClick={() =>
          setMeasureMode((v) => {
            const next = !v;
            if (next) {
              setRadiusMode(false);
              setRadiusCenter(null);
            } else {
              setMeasurePoints([]);
              setSelectedMeasureIdx(null);
              setMeasureRelocate(false);
              setRouteResult(null);
            }
            return next;
          })
        }
        className={`chip whitespace-nowrap px-3 py-1.5 text-xs font-bold transition-colors ${
          measureMode
            ? "bg-primary text-white shadow-[0_4px_12px_rgba(29,79,216,.35)]"
            : "bg-[rgba(255,255,255,.75)] text-text-2"
        }`}
      >
        ↔ 거리
      </button>
    </>
  );

  // 확장 패널: 모든 범위/유형 필터 (칩 그룹) — 모바일 친화 접이식
  const filterPanel = filtersExpanded ? (
    /* 높이 상한은 바깥 래퍼가 화면 높이·상단 레인·하단 예약 레인으로 계산해
       내려준다(--nz-filter-max-h). 예전에는 여기서 `calc(100dvh-210px)` 로 잡았는데,
       모바일 상단이 218px 이라 패널 아래끝이 화면 밖으로 8px 밀려 있었다
       (402×874 실측: 218~882). 화면 밖으로 나간 필터는 스크롤로도 못 본다. */
    <div className="glass-strong flex max-h-[var(--nz-filter-max-h,calc(100dvh-210px))] w-full flex-col gap-3 overflow-y-auto rounded-[18px] p-4 shadow-[0_16px_40px_rgba(16,28,54,.2)]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-extrabold text-ink">상세 필터</span>
        <button
          type="button"
          onClick={() => setFiltersExpanded(false)}
          aria-label="필터 닫기"
          className="text-[13px] text-text-3"
        >
          ✕
        </button>
      </div>
      {/* ── 범위 슬라이더 (막대그래프) ──────────────────────────────────
          고정 칩("5억 이하 / 5~10억")을 걷어냈다. 남의 기준이라 "이 동네에서
          6~9억"을 고를 수 없었고, 무엇보다 그 구간에 몇 개가 있는지 모른 채
          눌러야 했다. 막대는 지금 보이는 지역의 실측 분포다. */}
      {facets ? (
        <>
          <HistogramRangeSlider
            label="가격대(매매 평균)"
            lo={facets.price.lo ?? 0}
            hi={facets.price.hi ?? 0}
            bins={facets.price.bins}
            value={ranges.price}
            onChange={(v) => setRanges((p) => ({ ...p, price: v }))}
            format={manwonShort}
            available={facets.price.n}
            total={facets.total}
            step={500}
          />
          <HistogramRangeSlider
            label="전용면적"
            lo={facets.area.lo ?? 0}
            hi={facets.area.hi ?? 0}
            bins={facets.area.bins}
            value={ranges.area}
            onChange={(v) => setRanges((p) => ({ ...p, area: v }))}
            format={(v) => `${Math.round(v)}㎡`}
            available={facets.area.n}
            total={facets.total}
            step={1}
          />
          <HistogramRangeSlider
            label="준공연도"
            lo={facets.year.lo ?? 0}
            hi={facets.year.hi ?? 0}
            bins={facets.year.bins}
            value={ranges.year}
            onChange={(v) => setRanges((p) => ({ ...p, year: v }))}
            format={(v) => `${Math.round(v)}년`}
            available={facets.year.n}
            total={facets.total}
            step={1}
          />
          {/* 세대수 — 예전엔 "데이터 준비 중" 비활성이었다. 국토부 상세(V4)
              백필이 돌면서 값이 들어오기 시작해 이제 실제로 동작한다.
              아직 값이 없는 단지가 많다는 사실은 슬라이더 아래에 그대로 적힌다. */}
          <HistogramRangeSlider
            label="세대수 규모"
            lo={facets.households.lo ?? 0}
            hi={facets.households.hi ?? 0}
            bins={facets.households.bins}
            value={ranges.households}
            onChange={(v) => setRanges((p) => ({ ...p, households: v }))}
            format={(v) => `${Math.round(v).toLocaleString("ko-KR")}세대`}
            available={facets.households.n}
            total={facets.total}
            step={10}
          />
        </>
      ) : (
        <div className="py-2 text-[11px] text-text-3">이 지역 분포를 불러오는 중…</div>
      )}
      <FilterChipGroup
        label={`거래유형 (매물${showListings ? "" : " · 선택 시 매물 레이어 권장"})`}
        options={LISTING_TRADE_OPTIONS}
        valueKey={listingTradeKey}
        onSelect={(key) => {
          setListingTradeKey(key);
          if (key === "monthly" || key === "sale" || key === "jeonse") {
            setShowListings(true);
          }
          if (key === "sale") setTxType("trade");
          if (key === "jeonse") setTxType("rent");
        }}
      />
      <FilterChipGroup
        label="건물 유형 (등록 매물)"
        options={PROPERTY_KIND_OPTIONS}
        valueKey={propertyKindKey}
        onSelect={(key) => {
          setPropertyKindKey(key);
          if (key !== "all") setShowListings(true);
        }}
      />
      <FilterChipGroup
        label="방 개수"
        options={ROOM_OPTIONS}
        valueKey={roomsKey}
        onSelect={(key) => {
          setRoomsKey(key);
          if (key !== "all") setShowListings(true);
        }}
      />
      <FilterChipGroup
        label="화장실"
        options={BATH_OPTIONS}
        valueKey={bathroomsKey}
        onSelect={(key) => {
          setBathroomsKey(key);
          if (key !== "all") setShowListings(true);
        }}
      />
      <FilterChipGroup
        label="주차"
        options={PARKING_OPTIONS}
        valueKey={parkingKey}
        onSelect={(key) => {
          setParkingKey(key);
          if (key !== "all") setShowListings(true);
        }}
      />
      <p className="text-[10px] leading-[1.5] text-text-3">
        방·화장실·주차·건물유형은 <b className="text-text-2">등록 매물</b> 기준입니다. 값이
        없는 매물은 해당 필터에서 제외돼요. 국토부 실거래(단지 마커)는 아파트 시세입니다.
        {showListings &&
          listingFetchStatus === "ok" &&
          listingItems.length === 0 &&
          !listingDetailFilterActive && (
            <>
              {" "}
              <b className="text-text-2">
                이 화면에는 아직 승인된 등록 매물이 없어요 — 필터가 고장 난 것이 아닙니다.
              </b>
            </>
          )}
        {showListings &&
          listingFetchStatus === "ok" &&
          listingItems.length === 0 &&
          listingDetailFilterActive && (
            <>
              {" "}
              <b className="text-text-2">
                조건을 모두 만족하는 등록 매물이 이 화면에 없어요. 필터를 완화해 보세요.
              </b>
            </>
          )}
        {!detailFiltersSupported && (
          <>
            {" "}
            <b className="text-warning">
              지금 서버는 상세 필터 컬럼이 없어 유형·방·화장실·주차 조건이 정확하지 않을 수
              있어요.
            </b>
          </>
        )}
      </p>

      {/* ===== 지도 레이어 — 정비사업(실적재 공개 자료) ===== */}
      <div className="flex flex-col gap-1.5 border-t border-[rgba(16,28,54,.08)] pt-2.5">
        <div className="text-[11px] font-bold text-text-3">지도 레이어</div>
        <div className="flex flex-wrap gap-1.5">
          {/* C1 시세 색상 오버레이 토글 — 실거래 평단가 구간별 색 */}
          <button
            type="button"
            aria-pressed={showPriceOverlay}
            onClick={() => setShowPriceOverlay((v) => !v)}
            className={`chip whitespace-nowrap px-2.5 py-1.5 text-xs transition-colors ${
              showPriceOverlay
                ? "bg-primary-soft font-bold text-primary"
                : "bg-[rgba(255,255,255,.85)] text-text-2"
            }`}
          >
            <Icon name="🎨" size={14} className="inline align-middle" /> 시세 색상
          </button>
          {/* 정비사업 레이어 토글 — 재개발·재건축 사업장을 사업종류별 색상 마커로 */}
          <button
            type="button"
            aria-pressed={showRedevelopment}
            onClick={() => setShowRedevelopment((v) => !v)}
            className={`chip whitespace-nowrap px-2.5 py-1.5 text-xs transition-colors ${
              showRedevelopment
                ? "bg-primary-soft font-bold text-primary"
                : "bg-[rgba(255,255,255,.85)] text-text-2"
            }`}
          >
            <Icon name="landmark" size={14} className="inline align-middle" /> 정비사업
          </button>
        </div>
        <div className="text-[10px] text-text-3">
          정비사업은 공개 자료 기준 참고값이에요. 실제 추진 단계는 관할 구청 고시를 확인하세요.
        </div>
      </div>

      {/* ===== 출퇴근 필터 (#10) — 회사 주소 + 임계 소요시간 ===== */}
      <div className="flex flex-col gap-1.5 border-t border-[rgba(16,28,54,.08)] pt-2.5">
        <div className="text-[11px] font-bold text-text-3">출퇴근 (회사 위치)</div>
        <input
          type="text"
          value={officeInput}
          onChange={(e) => setOfficeInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setOfficeQuery(officeInput.trim());
            }
          }}
          placeholder="회사 주소 (예: 강남구 테헤란로 152)"
          aria-label="회사 주소"
          className="w-full rounded-lg border border-line bg-[rgba(255,255,255,.9)] px-2.5 py-1.5 text-xs text-text-1 outline-none placeholder:text-text-3"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOfficeQuery(officeInput.trim())}
            className="btn-soft rounded-lg px-2.5 py-1.5 text-[11px] font-bold"
          >
            적용
          </button>
          {COMMUTE_OPTIONS.map((o) => {
            const active = o.key === commuteKey;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setCommuteKey(o.key)}
                className={`chip whitespace-nowrap px-2.5 py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-primary font-bold text-white"
                    : "bg-[rgba(255,255,255,.85)] text-text-2"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {commuteLoading && (
          <div className="text-[10px] text-text-3">소요시간 계산 중…</div>
        )}
        {commuteError && <div className="text-[10px] text-danger">{commuteError}</div>}
        {!commuteError && commuteOfficeResolved && commuteBasis === "haversine" && (
          <div className="text-[10px] text-text-3">
            직선거리 기준(정확 소요시간은 연동 시)
          </div>
        )}
        {!commuteError && commuteOfficeResolved && commuteBasis === "directions" && (
          <div className="text-[10px] text-text-3">실시간 경로 기준 소요시간</div>
        )}
        {commuteActive && commuteThreshold !== null && (
          <div className="text-[10px] font-bold text-primary">
            출퇴근 {commuteThreshold}분 이내 · 단지 {filteredDanji.length}개
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[rgba(16,28,54,.08)] pt-2.5">
        <button type="button" onClick={resetFilters} className="text-[12px] font-bold text-text-3 underline">
          전체 초기화
        </button>
        <button
          type="button"
          onClick={() => setFiltersExpanded(false)}
          className="btn-primary rounded-lg px-4 py-1.5 text-xs"
        >
          단지 {filteredDanji.length} 적용
        </button>
      </div>
    </div>
  ) : null;

  /* ===== 서버 클러스터링 상태 — 낮은 줌에서 42k 단지를 그리드 집계로 표시 ===== */
  const [clusterMode, setClusterMode] = useState<"points" | "clusters">("points");
  const [clusters, setClusters] = useState<ClusterItem[]>([]);
  const [extraPoints, setExtraPoints] = useState<ClusterPointItem[]>([]);
  /** C1 — 화면에 칠한 색의 출처(최근 계약월·건수). 범례가 이 값을 그대로 읽는다. */
  const [priceMeta, setPriceMeta] = useState<PriceMeta>(EMPTY_PRICE_META);
  /** item5 — 마지막 클러스터 조회 결과. "빈 결과"와 "조회 실패"를 구분해 안내한다. */
  const [clusterFetchStatus, setClusterFetchStatus] = useState<"idle" | "ok" | "error">(
    "idle",
  );
  /* 포인트 300개 상한 절단 여부 — 조용한 절단은 "이게 전부"라는 거짓이 된다 */
  const [pointsTruncated, setPointsTruncated] = useState(false);
  /** item5 — 현재 뷰포트(빈 지도 판정에 사용). idle 마다 갱신 */
  const [viewBounds, setViewBounds] = useState<MapIdleInfo["bounds"]>(null);
  const fetchTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 거래유형(매매/전세) 최신값 참조 + 마지막 idle 정보(토글 변경 시 재조회용)
  const txTypeRef = useRef(txType);
  txTypeRef.current = txType;
  const lastIdleRef = useRef<{ bounds: NonNullable<MapIdleInfo["bounds"]>; zoom: number } | null>(
    null,
  );

  /* ===== 인기 단지 패널 상태 ===== */
  const [popular, setPopular] = useState<PopularItem[]>([]);
  /** "viewport" = 보이는 영역 기준, "nationwide" = 줌아웃(전국) */
  const [popularScope, setPopularScope] = useState<"viewport" | "nationwide">("nationwide");
  /* 조회 실패를 빈 목록으로 그리지 않기 위한 상태. 빈 목록과 실패는 다른 사실이다 —
     전자는 "이 지역엔 단지가 없다", 후자는 "우리가 못 읽었다". */
  const [popularFailed, setPopularFailed] = useState(false);
  const [popularLoading, setPopularLoading] = useState(true);
  const popularTimerRef = useRef<number | null>(null);
  const popularAbortRef = useRef<AbortController | null>(null);

  /* ===== 매물 레이어 fetch/refs (상태 선언은 상단) ===== */
  const showListingsRef = useRef(showListings);
  showListingsRef.current = showListings;
  const lastBoundsRef = useRef<MapIdleInfo["bounds"]>(null);
  const listingTimerRef = useRef<number | null>(null);
  const listingAbortRef = useRef<AbortController | null>(null);
  // 거래유형 필터를 최신값으로 참조 (콜백 재생성 없이 type 파라미터 반영)
  const listingTradeRef = useRef(listingTradeKey);
  listingTradeRef.current = listingTradeKey;
  const propertyKindRef = useRef(propertyKindKey);
  propertyKindRef.current = propertyKindKey;
  const roomsKeyRef = useRef(roomsKey);
  roomsKeyRef.current = roomsKey;
  const bathroomsKeyRef = useRef(bathroomsKey);
  bathroomsKeyRef.current = bathroomsKey;
  const parkingKeyRef = useRef(parkingKey);
  parkingKeyRef.current = parkingKey;

  const fetchListings = useCallback((bounds: NonNullable<MapIdleInfo["bounds"]>) => {
    if (listingTimerRef.current !== null) window.clearTimeout(listingTimerRef.current);
    listingTimerRef.current = window.setTimeout(() => {
      listingAbortRef.current?.abort();
      const controller = new AbortController();
      listingAbortRef.current = controller;
      const params = new URLSearchParams({
        swLat: String(bounds.swLat),
        swLng: String(bounds.swLng),
        neLat: String(bounds.neLat),
        neLng: String(bounds.neLng),
      });
      const tradeType = LISTING_TRADE_OPTIONS.find((o) => o.key === listingTradeRef.current)?.type;
      if (tradeType) params.set("type", tradeType);
      const kind = PROPERTY_KIND_OPTIONS.find((o) => o.key === propertyKindRef.current)?.kind;
      if (kind) params.set("kind", kind);
      const roomsMin = ROOM_OPTIONS.find((o) => o.key === roomsKeyRef.current)?.min;
      if (roomsMin != null) params.set("roomsMin", String(roomsMin));
      const bathroomsMin = BATH_OPTIONS.find((o) => o.key === bathroomsKeyRef.current)?.min;
      if (bathroomsMin != null) params.set("bathroomsMin", String(bathroomsMin));
      const parkingMin = PARKING_OPTIONS.find((o) => o.key === parkingKeyRef.current)?.min;
      if (parkingMin != null) params.set("parkingMin", String(parkingMin));
      fetch(`/api/map/listings?${params.toString()}`, { signal: controller.signal })
        .then(
          (res) =>
            res.ok
              ? (res.json() as Promise<{
                  items: MapListingItem[];
                  detailFiltersSupported?: boolean;
                }>)
              : null,
        )
        .then((json) => {
          if (controller.signal.aborted) return;
          if (!json) {
            setListingFetchStatus("error");
            return;
          }
          setListingItems(Array.isArray(json.items) ? json.items : []);
          setListingFetchStatus("ok");
          if (typeof json.detailFiltersSupported === "boolean") {
            setDetailFiltersSupported(json.detailFiltersSupported);
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setListingFetchStatus("error");
        });
    }, LISTING_FETCH_DEBOUNCE_MS);
  }, []);

  // 토글 ON: 마지막 뷰포트로 즉시 로드 / OFF: 매물 마커 비우고 진행 중 요청 취소
  useEffect(() => {
    if (showListings) {
      if (lastBoundsRef.current) fetchListings(lastBoundsRef.current);
    } else {
      if (listingTimerRef.current !== null) window.clearTimeout(listingTimerRef.current);
      listingAbortRef.current?.abort();
      setListingItems([]);
      setListingFetchStatus("idle");
    }
  }, [showListings, fetchListings]);

  // 매물 필터 변경 → 레이어가 켜져 있으면 서버 재조회
  useEffect(() => {
    if (showListings && lastBoundsRef.current) fetchListings(lastBoundsRef.current);
  }, [
    listingTradeKey,
    propertyKindKey,
    roomsKey,
    bathroomsKey,
    parkingKey,
    showListings,
    fetchListings,
  ]);

  /** 클러스터/포인트 조회 예약 — 디바운스 후 현재 거래유형(매매/전세)으로 요청 */
  const scheduleClusterFetch = useCallback(
    (bounds: NonNullable<MapIdleInfo["bounds"]>, mapZoom: number) => {
      if (fetchTimerRef.current !== null) window.clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = window.setTimeout(() => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        /* 뷰포트를 줌별 격자에 스냅(밖으로 확장)해 URL 을 정규화한다.
           원시 bounds 는 픽셀 단위로 연속 변동해 팬 한 번마다 URL 이 달라지고,
           s-maxage=300 CDN 캐시가 사실상 한 번도 재사용되지 못했다 — 같은
           동네를 보는 사용자들이 전부 오리진 DB 를 때렸다. 스냅 격자는 항상
           원래 뷰포트를 포함하므로(밖으로 내림/올림) 화면에 빠지는 마커는 없다. */
        const snapStep = mapZoom >= 15 ? 0.01 : mapZoom >= 12 ? 0.05 : 0.2;
        const snapDown = (v: number) => (Math.floor(v / snapStep) * snapStep).toFixed(4);
        const snapUp = (v: number) => (Math.ceil(v / snapStep) * snapStep).toFixed(4);
        const params = new URLSearchParams({
          minLat: snapDown(bounds.swLat),
          maxLat: snapUp(bounds.neLat),
          minLng: snapDown(bounds.swLng),
          maxLng: snapUp(bounds.neLng),
          zoom: String(mapZoom),
        });
        if (txTypeRef.current === "rent") params.set("type", "rent");
        fetch(`/api/map/clusters?${params.toString()}`, { signal: controller.signal })
          .then((res) => (res.ok ? (res.json() as Promise<ClustersResponse>) : null))
          .then((json) => {
            if (controller.signal.aborted) return;
            if (!json) {
              // HTTP 오류 — 기존 마커는 유지하되, 빈 결과 안내와 구분되는 실패 상태 기록
              setClusterFetchStatus("error");
              return;
            }
            setClusterMode(json.mode);
            setClusters(Array.isArray(json.clusters) ? json.clusters : []);
            setExtraPoints(Array.isArray(json.points) ? json.points : []);
            setPriceMeta(json.priceMeta ?? EMPTY_PRICE_META);
            setPointsTruncated(Boolean(json.truncated));
            setClusterFetchStatus("ok");
          })
          .catch(() => {
            // 실패 시 기존 마커 유지 — 상태만 오류로 (abort 는 오류 아님)
            if (!controller.signal.aborted) setClusterFetchStatus("error");
          });
      }, CLUSTER_FETCH_DEBOUNCE_MS);
    },
    [],
  );

  /**
   * 보이는 영역의 인기 단지 재조회.
   * 줌이 POPULAR_NATIONWIDE_MAX_ZOOM 이하면 화면이 너무 넓어 "이 지역"이라 부를 수
   * 없으므로 범위를 빼고 전국 기준으로 받는다(소유자 요청: 줌아웃 시 전국 인기).
   */
  const schedulePopularFetch = useCallback(
    (bounds: NonNullable<MapIdleInfo["bounds"]> | null, mapZoom: number) => {
      if (popularTimerRef.current !== null) window.clearTimeout(popularTimerRef.current);
      popularTimerRef.current = window.setTimeout(() => {
        popularAbortRef.current?.abort();
        const controller = new AbortController();
        popularAbortRef.current = controller;
        const useBounds = bounds !== null && mapZoom > POPULAR_NATIONWIDE_MAX_ZOOM;
        const qs = new URLSearchParams({ limit: String(POPULAR_LIMIT) });
        if (useBounds && bounds) {
          qs.set("minLat", String(bounds.swLat));
          qs.set("maxLat", String(bounds.neLat));
          qs.set("minLng", String(bounds.swLng));
          qs.set("maxLng", String(bounds.neLng));
        }
        // 상세 필터 범위를 그대로 서버 조건으로 — 클라이언트에서 자르지 않는다
        // (화면에 안 온 단지는 클라이언트가 걸러 봐야 알 수 없다).
        const r = rangesRef.current;
        const put = (k: string, v: number | null) => {
          if (v !== null) qs.set(k, String(v));
        };
        put("priceMin", r.price[0]); put("priceMax", r.price[1]);
        put("areaMin", r.area[0]);   put("areaMax", r.area[1]);
        put("yearMin", r.year[0]);   put("yearMax", r.year[1]);
        put("hhMin", r.households[0]); put("hhMax", r.households[1]);
        setPopularLoading(true);
        fetch(`/api/map/popular?${qs.toString()}`, { signal: controller.signal })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((j: { scope: "viewport" | "nationwide"; items: PopularItem[] }) => {
            if (controller.signal.aborted) return;
            const items = Array.isArray(j.items) ? j.items : [];
            setPopular(items);
            setPopularScope(j.scope === "viewport" ? "viewport" : "nationwide");
            setPopularFailed(false);
            setPopularLoading(false);
            /* 뷰포트: 좌측 목록을 뷰포트 단지로 교체. 전국: 뷰포트 목록 비워 SSR 시드 복귀 */
            if (j.scope === "viewport") {
              setViewportDanji(
                items
                  .filter(
                    (it) =>
                      Number.isFinite(it.lat) &&
                      Number.isFinite(it.lng) &&
                      it.id &&
                      it.name,
                  )
                  .map((it): DanjiItem => {
                    const avgWon =
                      it.avgPriceManwon != null && Number.isFinite(it.avgPriceManwon)
                        ? Math.round(it.avgPriceManwon * 10_000)
                        : null;
                    const priceLabel =
                      it.avgPriceManwon != null && it.avgPriceManwon >= 10_000
                        ? `${(it.avgPriceManwon / 10_000).toFixed(1)}억`
                        : it.avgPriceManwon != null
                          ? `${Math.round(it.avgPriceManwon).toLocaleString("ko-KR")}만`
                          : "—";
                    return {
                      id: it.id,
                      name: it.name,
                      note: null,
                      meta: it.regionName || "",
                      price: priceLabel,
                      delta: "",
                      deltaTone: "flat",
                      size:
                        it.avgAreaM2 != null
                          ? `${Math.round(it.avgAreaM2)}㎡`
                          : "",
                      lat: it.lat,
                      lng: it.lng,
                      avgPriceWon: avgWon,
                      momPct: null,
                      areaM2: it.avgAreaM2,
                      buildYear: it.buildYear,
                      households: it.households,
                      buildingType: null,
                      trades: [],
                      latestYm: null,
                      latestDealCount: it.recentTradeCount || null,
                    };
                  }),
              );
            } else {
              setViewportDanji([]);
            }
          })
          .catch((e) => {
            if (controller.signal.aborted || (e as Error)?.name === "AbortError") return;
            /* 직전 목록을 지우지 않는다 — 한 번 실패했다고 화면이 비어 버리면
               사용자는 "이 지역엔 단지가 없다"로 읽는다. 실패 표시만 켠다. */
            setPopularFailed(true);
            setPopularLoading(false);
          });
      }, POPULAR_FETCH_DEBOUNCE_MS);
    },
    [],
  );

  /**
   * 뷰포트 분포(막대그래프) 재조회.
   * 필터를 **걸기 전** 분포를 받는다 — 필터 후 분포를 그리면 손잡이를 좁힐수록
   * 막대가 사라져 되돌릴 기준을 잃는다.
   */
  const fetchFacets = useCallback(
    (bounds: NonNullable<MapIdleInfo["bounds"]> | null, mapZoom: number) => {
      facetsAbortRef.current?.abort();
      const controller = new AbortController();
      facetsAbortRef.current = controller;
      const useBounds = bounds !== null && mapZoom > POPULAR_NATIONWIDE_MAX_ZOOM;
      const qs = new URLSearchParams({ buckets: "24" });
      if (useBounds && bounds) {
        qs.set("minLat", String(bounds.swLat));
        qs.set("maxLat", String(bounds.neLat));
        qs.set("minLng", String(bounds.swLng));
        qs.set("maxLng", String(bounds.neLng));
      }
      fetch(`/api/map/facets?${qs.toString()}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: MapFacets) => {
          if (!controller.signal.aborted) setFacets(j);
        })
        .catch(() => {
          /* 분포를 못 받으면 슬라이더를 그리지 않는다(HistogramRangeSlider 가
             축이 성립하지 않으면 안내 문구로 대체). 직전 분포는 지우지 않는다. */
        });
    },
    [],
  );

  /* 첫 진입 — 지도 idle 이 오기 전에도 패널이 비어 있지 않도록 전국 기준으로 먼저 채운다. */
  useEffect(() => {
    schedulePopularFetch(null, 0);
    fetchFacets(null, 0);
  }, [schedulePopularFetch, fetchFacets]);

  /* 손잡이를 놓으면 목록을 다시 받는다(분포는 그대로 — 위 주석 참고). */
  useEffect(() => {
    const last = lastIdleRef.current;
    schedulePopularFetch(last?.bounds ?? null, last?.zoom ?? 0);
  }, [ranges, schedulePopularFetch]);

  const handleMapIdle = useCallback(
    (info: MapIdleInfo) => {
      const bounds = info.bounds;
      if (!bounds) return;
      lastBoundsRef.current = bounds;
      lastIdleRef.current = { bounds, zoom: info.zoom };
      setViewBounds(bounds);
      if (showListingsRef.current) fetchListings(bounds);
      scheduleClusterFetch(bounds, info.zoom);
      schedulePopularFetch(bounds, info.zoom);
      fetchFacets(bounds, info.zoom);
    },
    [fetchListings, scheduleClusterFetch, schedulePopularFetch, fetchFacets],
  );

  // 매매/전세 토글 변경 → 마지막 뷰포트로 즉시 재조회
  useEffect(() => {
    if (lastIdleRef.current) {
      scheduleClusterFetch(lastIdleRef.current.bounds, lastIdleRef.current.zoom);
    }
  }, [txType, scheduleClusterFetch]);

  useEffect(
    () => () => {
      if (fetchTimerRef.current !== null) window.clearTimeout(fetchTimerRef.current);
      abortRef.current?.abort();
      if (listingTimerRef.current !== null) window.clearTimeout(listingTimerRef.current);
      listingAbortRef.current?.abort();
      commuteAbortRef.current?.abort();
      if (popularTimerRef.current !== null) window.clearTimeout(popularTimerRef.current);
      popularAbortRef.current?.abort();
    },
    [],
  );

  // 출퇴근(#10): 회사 주소 제출 → /api/map/commute 로 (범위 필터된) 단지 소요시간 추정.
  // 임계값(commuteKey) 변경은 재조회 없이 클라 필터만 갱신하므로 deps 에서 제외.
  useEffect(() => {
    const q = officeQuery.trim();
    commuteAbortRef.current?.abort();
    if (!q) {
      setCommuteMinutes(null);
      setCommuteBasis(null);
      setCommuteOfficeResolved(false);
      setCommuteError(null);
      setCommuteLoading(false);
      return;
    }
    const controller = new AbortController();
    commuteAbortRef.current = controller;
    setCommuteLoading(true);
    setCommuteError(null);
    const points = rangeFilteredDanji
      .slice(0, COMMUTE_MAX_POINTS)
      .map((d) => ({ id: d.id, lat: d.lat, lng: d.lng }));
    fetch("/api/map/commute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ office: q, points }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<CommuteResponse>) : null))
      .then((json) => {
        if (!json || controller.signal.aborted) return;
        setCommuteBasis(json.basis ?? null);
        if (!json.office) {
          setCommuteMinutes(null);
          setCommuteOfficeResolved(false);
          setCommuteError(json.error ?? "회사 위치를 확인할 수 없어요.");
          return;
        }
        const map = new Map<string, number>();
        for (const r of json.results ?? []) {
          if (typeof r.id === "string" && Number.isFinite(r.minutes)) map.set(r.id, r.minutes);
        }
        setCommuteMinutes(map);
        setCommuteOfficeResolved(true);
        setCommuteError(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCommuteError("소요시간을 불러오지 못했어요.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommuteLoading(false);
      });
    return () => controller.abort();
  }, [officeQuery, rangeFilteredDanji]);

  // 매물 레이어 마커 — 단지(회색 시세 말풍선)와 구분되는 파란 알약 + 유형·가격 라벨.
  // avgPricePerM2 정의 → price marker 스타일, tierColor로 파란 강조, 부스트는 ★.
  const listingMarkers = useMemo<MapMarkerData[]>(() => {
    if (!showListings) return [];
    return listingItems.map((l) => {
      const typeLabel = LISTING_TYPE_LABEL_MAP[l.listingType] ?? "매물";
      return {
        id: `listing:${l.id}`,
        lat: l.lat,
        lng: l.lng,
        label: typeLabel,
        priceLabel: `${typeLabel} ${l.priceLabel}`.trim(),
        avgPricePerM2: 1, // 시세 말풍선 스타일 강제
        tierColor: LISTING_MARKER_COLOR,
        favorite: l.boosted, // 부스트 매물 우선 노출(★)
        infoHtml: "",
      };
    });
  }, [showListings, listingItems]);

  /* ===== 정비사업 레이어 — 토글 ON 시 1회 로드(전국 소량 · bbox 불필요) =====
     서버(app/api/redevelopment/projects)는 조회 실패를 일부러 503 으로 돌려준다.
     주석까지 달려 있다 — "items: [] 로 답하면 지도가 '이 영역에 정비사업이
     없다'고 그리게 되고, 그건 장애를 사실로 바꿔 말하는 것이다."

     그런데 여기서 `r.ok ? r.json() : { items: [] }` 로 그 503 을 정확히 빈
     배열로 되돌려 놓고 있었다. 서버가 막으려던 오해를 화면에서 되살린 셈이다.
     이제 실패는 실패로 들고 와서 마커 대신 안내를 띄운다. */
  useEffect(() => {
    if (!showRedevelopment || redevItems.length > 0) return;
    const controller = new AbortController();
    setRedevFailed(false);
    fetch("/api/redevelopment/projects?limit=3000", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { items?: RedevelopmentProject[] }) => {
        if (controller.signal.aborted) return;
        setRedevItems(Array.isArray(json.items) ? json.items : []);
        setRedevFailed(false);
      })
      .catch((e) => {
        if (controller.signal.aborted || (e as Error)?.name === "AbortError") return;
        setRedevFailed(true);
      });
    return () => controller.abort();
  }, [showRedevelopment, redevItems.length]);

  const redevelopmentMarkers = useMemo<MapMarkerData[]>(() => {
    if (!showRedevelopment) return [];
    return redevItems.map((p) => {
      const color = colorForType(p.typeKey);
      const src = p.sourceUrl
        ? `<a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#3182f6">출처 ↗</a>`
        : "";
      const hh = p.households
        ? `<p style="font-size:11px;color:#888;margin:2px 0 0">예정 ${p.households.toLocaleString()}세대</p>`
        : "";
      const infoHtml = `<div style="min-width:180px;max-width:230px">
        <p style="font-size:13px;font-weight:800;color:#191f28;margin:0">${p.name}</p>
        <p style="font-size:12px;margin:3px 0 0;display:flex;align-items:center;gap:5px">
          <span style="display:inline-block;width:9px;height:9px;border-radius:9999px;background:${color}"></span>
          <span style="color:#333;font-weight:600">${labelForType(p.typeKey)}</span>
          <span style="color:#aaa">·</span>
          <span style="color:#555">${stageLabel(p.stageKey)}</span>
        </p>
        <p style="font-size:11px;color:#888;margin:3px 0 0">${p.sigungu}${p.address ? " · " + p.address : ""}</p>
        ${hh}
        <div style="margin-top:5px">${src}</div>
      </div>`;
      return {
        id: `redev:${p.id}`,
        lat: p.lat,
        lng: p.lng,
        label: p.name,
        pinColor: color,
        infoHtml,
      };
    });
  }, [showRedevelopment, redevItems]);

  // 정비사업 레이어 범례 (#20) — 화면에 실제 존재하는 사업종류만 색상칩으로 노출
  const redevLegend = useMemo<{ color: string; label: string }[]>(() => {
    if (!showRedevelopment) return [];
    const seen = new Map<string, { color: string; label: string }>();
    for (const p of redevItems) {
      if (!seen.has(p.typeKey)) {
        seen.set(p.typeKey, {
          color: colorForType(p.typeKey),
          label: labelForType(p.typeKey),
        });
      }
    }
    return Array.from(seen.values());
  }, [showRedevelopment, redevItems]);

  // 지역(구/시) 실시세 마커 — 한국부동산원(REB) 실데이터. 시·군·구/동 줌에서만 노출.
  const regionMarketMarkers = useMemo<MapMarkerData[]>(() => {
    if (regionMarkers.length === 0) return [];
    return regionMarkers.map((r) => {
      const price = manwonLabel(r.avgManwon) ?? "—";
      const up = (r.changePct ?? 0) >= 0;
      const chgHtml =
        r.changePct != null
          ? `<span style="color:${up ? "#e11900" : "#1565d8"};font-weight:700">${up ? "▲" : "▼"}${Math.abs(r.changePct).toFixed(2)}%</span>`
          : "";
      const infoHtml = `<div style="min-width:150px;font-family:sans-serif">
        <p style="font-weight:800;font-size:13px;margin:0;color:#191f28">${r.name}</p>
        <p style="font-size:12px;margin:3px 0 0;color:#333">평균 매매 <b>${price}</b> ${chgHtml}</p>
        <p style="font-size:11px;color:#888;margin:2px 0 0">거래 ${r.tradeCount.toLocaleString("ko-KR")}건${r.jeonseRatio != null ? ` · 전세가율 ${Math.round(r.jeonseRatio)}%` : ""}</p>
        <p style="font-size:10px;color:#aaa;margin:2px 0 0">${r.period.slice(0, 4)}.${r.period.slice(4, 6)} · 한국부동산원</p>
      </div>`;
      return {
        id: `region:${r.id}`,
        lat: r.lat,
        lng: r.lng,
        label: r.name,
        priceLabel: price,
        avgPricePerM2: 1, // 시세 말풍선 스타일 플래그
        momPct: r.changePct ?? undefined,
        infoHtml,
      };
    });
  }, [regionMarkers]);

  const markers = useMemo<MapMarkerData[]>(() => {
    const infoId = infoComplex?.id ?? null;
    // 지역 시세 마커는 시·군·구/동 줌에서만 — 매매 평균이라 전세 모드에선 숨김(값 혼동 방지)
    const regionLayer =
      zoom === "danji" || txType === "rent" ? [] : regionMarketMarkers;
    // 검색/포인트로 선택된 목록 밖 단지를 하이라이트 마커로 주입 (중복 id 제외)
    const withSearch = (arr: MapMarkerData[]): MapMarkerData[] => {
      if (!searchMarker || arr.some((m) => m.id === searchMarker.id)) return arr;
      return [
        ...arr,
        {
          id: searchMarker.id,
          lat: searchMarker.lat,
          lng: searchMarker.lng,
          label: searchMarker.name,
          pinColor: "#1d4fd8",
          selected: true,
          infoHtml: "",
        },
      ];
    };
    // 낮은 줌: 서버 그리드 클러스터만 표시 (개수 배지 원형 마커) + 매물 레이어
    if (clusterMode === "clusters" && clusters.length > 0) {
      const base: MapMarkerData[] = clusters.map((c) => {
        const common = {
          /* id 는 **셀 키**로 만든다. 예전에는 `cluster:${c.lat}:${c.lng}` 였는데
             그 좌표는 뷰포트 안 단지들의 무게중심이라 팬할 때마다 흔들렸고,
             NaverMap 은 id 로 마커 재사용을 판정하므로 화면의 클러스터 마커가
             매번 전부 파괴·재생성됐다. 셀은 안 움직인다. */
          id: `cluster:${c.key ?? `${c.lat}:${c.lng}`}`,
          lat: c.lat,
          lng: c.lng,
          label: c.count.toLocaleString("ko-KR"),
          infoHtml: "",
        };
        // 오버레이 OFF — 예전처럼 개수만 세는 파란 원형 배지.
        // 전세 모드도 개수만 — 셀 단위 보증금 집계가 없어서 색을 칠면 거짓이 된다.
        if (!showPriceOverlay || txType === "rent") {
          return { ...common, pinColor: "rgba(29,79,216,.85)" };
        }
        // ON — "N개 · 4,020만/평" 알약. 실거래가 없는 셀은 회색 + "데이터 없음"이라
        // 색이 없는 사실을 색으로 메우지 않는다.
        return {
          ...common,
          priceLabel: pyeongPriceLabel(c.pyeongManwon) ?? NO_DATA_LABEL,
          pinColor: tierColor(c.pyeongManwon),
          pinTextColor: tierTextColor(c.pyeongManwon),
        };
      });
      return withSearch([
      ...regionLayer,
      ...base,
      ...listingMarkers,
      ...redevelopmentMarkers,
    ]);
    }
    // 높은 줌: 기존 시세 말풍선 마커 + 뷰포트 내 추가 단지 포인트.
    // 전세 모드에선 매매 평균 말풍선(danji 목록 마커)을 걷어내고, 서버 포인트의
    // 전세 평균 보증금 라벨로 대체한다 — 매매가를 전세가처럼 보이게 두지 않는다.
    const base: MapMarkerData[] =
      txType === "rent"
        ? []
        : filteredDanji.map((d) => ({
            id: d.id,
            lat: d.lat,
            lng: d.lng,
            label: d.name,
            priceLabel: d.price,
            avgPriceWon: d.avgPriceWon ?? undefined,
            // 시세 말풍선 스타일 강제 (avgPricePerM2 정의 시 price marker)
            avgPricePerM2: d.avgPriceWon ? d.avgPriceWon / 84 : 1,
            momPct: d.momPct ?? undefined,
            selected: d.id === selectedId || d.id === infoId,
            infoHtml: "", // 인포윈도우 대신 글래스 상세 패널 사용
            // 단지 줌에서만 이름을 값과 함께 — 넓은 줌에선 이름끼리 겹친다.
            showName: zoom === "danji",
            households: d.households ?? undefined,
            buildYear: d.buildYear ?? undefined,
            avgAreaM2: d.areaM2 ?? undefined,
          }));
    /* 지도에 실제로 찍히는 마커는 대부분 이 extraPoints 다(서버 렌더 목록은 30개).
       예전에는 여기에 필터로 쓸 값이 없어서 필터가 걸리면 통째로 숨겼는데,
       그러면 화면이 거의 비어 버렸다. 이제 clusters API 가 네 축을 함께 주므로
       같은 기준(withinSel)으로 걸러서 그린다.
       전세 모드는 매매 기준 범위 필터와 무관하므로 필터를 적용하지 않는다. */
    {
      const applyRange = rangeActive && txType !== "rent";
      const known = new Set(base.map((m) => m.id));
      for (const p of extraPoints) {
        if (known.has(p.id)) continue;
        if (
          applyRange &&
          !(
            withinSel(p.avgPriceManwon ?? null, ranges.price) &&
            withinSel(p.avgAreaM2 ?? null, ranges.area) &&
            withinSel(p.buildYear ?? null, ranges.year) &&
            withinSel(p.households ?? null, ranges.households)
          )
        ) {
          continue;
        }
        const marker: MapMarkerData = {
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          label: p.name,
          selected: p.id === infoId,
          infoHtml: "",
          showName: zoom === "danji",
          households: p.households ?? undefined,
          buildYear: p.buildYear ?? undefined,
          avgAreaM2: p.avgAreaM2 ?? undefined,
        };
        if (txType === "rent") {
          // 전세 — 평균 보증금 말풍선(전용 색). 전세 실거래 없는 단지는 기본 마커.
          const rentLabel = p.jeonseManwon ? manwonLabel(p.jeonseManwon) : null;
          if (rentLabel) {
            marker.priceLabel = `전세 ${rentLabel}`;
            marker.avgPricePerM2 = 1; // 시세 말풍선 스타일 플래그
            marker.tierColor = JEONSE_MARKER_COLOR;
          }
        } else {
          // C1 — 단지 줌에서도 색이 이어지도록 실거래 평단가를 말풍선으로.
          // 거래가 없는 단지는 손대지 않는다(기존 원형 마커 = 아무 시세도 주장하지 않음).
          const label = showPriceOverlay ? pyeongPriceLabel(p.pyeongManwon) : null;
          if (label) {
            marker.priceLabel = label;
            marker.avgPricePerM2 = 1; // 시세 말풍선 스타일 플래그
            marker.tierColor = tierColor(p.pyeongManwon);
          }
        }
        base.push(marker);
      }
    }
    // C3 반경 필터 — 찍은 중심(없으면 지도 중심)에서 radiusM 내 단지 마커만 표시
    const shownBase = radiusMode
      ? base.filter(
          (m) => haversineM(radiusOrigin.lat, radiusOrigin.lng, m.lat, m.lng) <= radiusM,
        )
      : base;
    return withSearch([
      ...regionLayer,
      ...shownBase,
      ...listingMarkers,
      ...redevelopmentMarkers,
    ]);
  }, [
    clusterMode,
    clusters,
    extraPoints,
    showPriceOverlay,
    filteredDanji,
    rangeActive,
    ranges,
    selectedId,
    infoComplex,
    searchMarker,
    listingMarkers,
    redevelopmentMarkers,
    regionMarketMarkers,
    zoom,
    txType,
    radiusMode,
    radiusM,
    radiusOrigin.lat,
    radiusOrigin.lng,
  ]);

  /* ===== item5 — 빈 지도 안내. 조회 실패("일시적 오류")와 빈 결과를 구분한다. ===== */
  const viewportEmpty = useMemo(() => {
    if (clusterFetchStatus !== "ok") return false;
    if (clusters.length > 0 || extraPoints.length > 0) return false;
    if (!viewBounds) return false;
    // 서버 주입 단지 마커가 뷰포트 안에 있으면 빈 지도가 아니다 (전세 모드는 미표시라 제외)
    if (txType !== "rent") {
      const anyInView = filteredDanji.some(
        (d) =>
          d.lat >= viewBounds.swLat &&
          d.lat <= viewBounds.neLat &&
          d.lng >= viewBounds.swLng &&
          d.lng <= viewBounds.neLng,
      );
      if (anyInView) return false;
    }
    return true;
  }, [clusterFetchStatus, clusters.length, extraPoints.length, viewBounds, filteredDanji, txType]);

  const selectDanji = (id: string) => {
    setFiltersExpanded(false);
    setSelectedId(null);
    setDetailTab("요약");
    const d = danji.find((x) => x.id === id);
    // 목록·마커 모두 밀도 높은 ComplexInfoPanel 경로로 통일 (얇은 selected 모달 대체).
    setInfoComplex({ id, name: d?.name ?? id });
    if (d && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
      setSearchMarker({ id: d.id, name: d.name, lat: d.lat, lng: d.lng });
      setCenter({ lat: d.lat, lng: d.lng });
    } else {
      setSearchMarker(null);
    }
  };

  /* ===== 검색 선택 · 정보 패널 핸들러 (item1·item2) ===== */
  const handleSearchSelectComplex = useCallback(
    (item: MapSearchSelectComplex) => {
      setFiltersExpanded(false);
      const inList = danji.find((d) => d.id === item.id);
      if (inList) {
        // 목록에 있는 단지 → 기존 리치 상세 패널 재사용
        selectDanji(item.id);
        setLevel(LEVEL_BY_ZOOM.danji);
        return;
      }
      // 목록 밖 단지 → 정보 패널 + 주소 on-demand 지오코딩으로 지도 이동·핀
      setSelectedId(null);
      setInfoComplex({ id: item.id, name: item.name });
      setLevel(LEVEL_BY_ZOOM.danji);
      const addr = item.address?.trim();
      if (!addr) {
        setSearchMarker(null);
        return;
      }
      fetch(`/api/map/geocode?q=${encodeURIComponent(addr)}&limit=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json: { items?: { lat: number; lng: number }[] } | null) => {
          const it = json?.items?.[0];
          if (it && Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
            setCenter({ lat: it.lat, lng: it.lng });
            setSearchMarker({ id: item.id, name: item.name, lat: it.lat, lng: it.lng });
          }
        })
        .catch(() => {
          /* 지오코딩 실패 — 정보 패널만 유지 */
        });
    },
    // selectDanji는 매 렌더 새로 생성되지만 danji가 실질 의존성
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [danji],
  );

  const handleSearchSelectAddress = useCallback((item: MapSearchSelectAddress) => {
    setFiltersExpanded(false);
    setSelectedId(null);
    setInfoComplex(null);
    setSearchMarker(null);
    setCenter({ lat: item.lat, lng: item.lng });
    setLevel(LEVEL_BY_ZOOM.danji);
  }, []);

  const handleInfoLoaded = useCallback(
    (info: { id: string; name: string; lat: number; lng: number }) => {
      setSearchMarker({ id: info.id, name: info.name, lat: info.lat, lng: info.lng });
      setCenter({ lat: info.lat, lng: info.lng });
    },
    [],
  );

  const closeInfoPanel = useCallback(() => {
    setInfoComplex(null);
    setSearchMarker(null);
  }, []);

  /**
   * 인기 단지 목록에서 단지 선택 → 좌측 패널을 상세로 바꾸고 지도를 그 단지로 옮긴다.
   * 좌표를 이미 알고 있으므로(popular API 가 함께 준다) 상세 로드를 기다리지 않고
   * 바로 지도를 이동한다 — 클릭했는데 아무 반응이 없는 순간을 없애기 위해서다.
   */
  const openInfoPanel = useCallback(
    (id: string, name: string, lat: number, lng: number) => {
      setSelectedId(null);
      setInfoComplex({ id, name });
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setSearchMarker({ id, name, lat, lng });
        setCenter({ lat, lng });
        setLevel(LEVEL_BY_ZOOM.danji);
      }
    },
    [],
  );

  /* ===== 검색↔지도 연동 (#9a) — 마운트 시 ?q= 를 기존 선택 로직으로 재현 ===== */
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    let q = "";
    try {
      q = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
    } catch {
      q = "";
    }
    if (!q) return;
    const controller = new AbortController();
    void (async () => {
      // 1) 단지 서제스트 우선 — 있으면 첫 후보를 선택(recenter+하이라이트)
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const j = r.ok
          ? ((await r.json()) as {
              suggestions?: { id: string; name: string; region: string }[];
            })
          : null;
        const first = j?.suggestions?.[0];
        if (first) {
          handleSearchSelectComplex({ id: first.id, name: first.name, region: first.region });
          return;
        }
      } catch {
        // 서제스트 실패 → 지오코딩 폴백
      }
      // 2) 주소 지오코딩 폴백 — 좌표가 있으면 지도 이동
      try {
        const r = await fetch(`/api/map/geocode?q=${encodeURIComponent(q)}&limit=1`, {
          signal: controller.signal,
        });
        const j = r.ok
          ? ((await r.json()) as { items?: { address: string; lat: number; lng: number }[] })
          : null;
        const it = j?.items?.[0];
        if (it && Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
          handleSearchSelectAddress({ address: it.address, lat: it.lat, lng: it.lng });
        }
      } catch {
        // 지오코딩 미설정/실패 — 조용히 무시
      }
    })();
    return () => controller.abort();
  }, [handleSearchSelectComplex, handleSearchSelectAddress]);

  const handleMarkerClick = (m: MapMarkerData) => {
    // 시세 히트맵 마커 — 표시 전용, 클릭 무시
    if (m.id.startsWith("heat:")) return;
    if (m.id.startsWith("redev:")) return; // 정비사업 마커는 네이티브 인포윈도우만
    // 지역 시세 마커 클릭 → 해당 지역으로 한 단계 확대(인포윈도우는 네이티브로 표시)
    if (m.id.startsWith("region:")) {
      setCenter({ lat: m.lat, lng: m.lng });
      setLevel((v) => Math.max(1, v - 2));
      return;
    }
    // 매물 마커 클릭 → 하단 미리보기 패널(이탈 없이). 상세는 패널의 "상세 보기"로.
    if (m.id.startsWith("listing:")) {
      setInfoComplex(null);
      setSelectedId(null);
      setListingPreviewId(m.id.slice("listing:".length));
      return;
    }
    // 클러스터 클릭 → 해당 지점으로 두 단계 확대
    if (m.id.startsWith("cluster:")) {
      setCenter({ lat: m.lat, lng: m.lng });
      setLevel((v) => Math.max(1, v - 2));
      return;
    }
    if (danji.some((d) => d.id === m.id)) {
      selectDanji(m.id);
      return;
    }
    // API 포인트(목록 밖 단지) — 중심 이동 + 정보 패널 열기(item2)
    setSelectedId(null);
    setCenter({ lat: m.lat, lng: m.lng });
    setSearchMarker({ id: m.id, name: m.label, lat: m.lat, lng: m.lng });
    setInfoComplex({ id: m.id, name: m.label });
  };

  /* 현재 위치 이동은 NaverMap 의 내장 버튼(enableGeolocation)이 맡는다.
     여기 있던 goToMyLocation 은 지웠다 — 같은 자리에 버튼이 두 개 겹쳐 그려져
     있었고, 가려져서 눌리지도 않던 이쪽 구현은 확대를 하지 않고, 실패를 알리지도
     않으며, center 상태가 같으면 두 번째 누름이 아무 일도 하지 않았다. */

  // 사실 우선: 실거래는 서버(market_transactions) 실데이터만 — 없으면 빈 배열(안내 문구)
  const trades = selected ? selected.trades : [];

  /* ===== item10 — 노트 쓰기 링크에 단지ID·좌표까지 전달 (작성 페이지가 읽는 파라미터) ===== */
  const noteHrefFor = (d: DanjiItem) => {
    const params = new URLSearchParams({
      apt: d.name,
      complexId: d.id,
      lat: String(d.lat),
      lng: String(d.lng),
    });
    return `/notes/new?${params.toString()}`;
  };

  /* ===== item9 — 노트 탭: 그 단지 임장노트 실제 조회 (inspection_notes 단지명 매칭) ===== */
  const [complexNotes, setComplexNotes] = useState<ComplexNoteItem[]>([]);
  const [complexNotesStatus, setComplexNotesStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const selectedName = selected?.name ?? null;
  const selectedComplexId = selected?.id ?? null;
  useEffect(() => {
    if (detailTab !== "노트" || (!selectedName && !selectedComplexId)) {
      setComplexNotes([]);
      setComplexNotesStatus("idle");
      return;
    }
    const controller = new AbortController();
    setComplexNotesStatus("loading");
    const qs = new URLSearchParams();
    if (selectedComplexId) qs.set("complexId", selectedComplexId);
    if (selectedName) qs.set("name", selectedName);
    fetch(`/api/map/complex-notes?${qs.toString()}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ notes?: ComplexNoteItem[] }>) : null))
      .then((j) => {
        if (controller.signal.aborted) return;
        if (!j) {
          setComplexNotesStatus("error");
          return;
        }
        setComplexNotes(Array.isArray(j.notes) ? j.notes : []);
        setComplexNotesStatus("ok");
      })
      .catch(() => {
        if (!controller.signal.aborted) setComplexNotesStatus("error");
      });
    return () => controller.abort();
  }, [detailTab, selectedName, selectedComplexId]);

  /* ===== 매물 탭 — 그 단지의 승인 매물 실제 조회 =====
     2026-07-27 이전에는 이 탭이 어떤 단지를 골라도 "이 단지의 실매물은 준비
     중이에요" 카드 하나를 고정으로 그렸다. 조회를 한 적이 없으니 매물이 있는지
     없는지 확인한 적도 없었다 — 실제로는 같은 단지의 승인 매물을 단지 홈
     (app/complex/[id]/page.tsx)이 listApprovedListings({ complexName }) 로
     이미 보여주고 있었다. 같은 데이터를 /api/listings?complex= 로 읽는다.
     조회 실패는 "0건"이 아니라 실패로 말한다. */
  const [complexListings, setComplexListings] = useState<ComplexListingItem[]>([]);
  const [complexListingsStatus, setComplexListingsStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  useEffect(() => {
    if (detailTab !== "매물" || !selectedName) {
      setComplexListings([]);
      setComplexListingsStatus("idle");
      return;
    }
    const controller = new AbortController();
    setComplexListingsStatus("loading");
    fetch(`/api/listings?complex=${encodeURIComponent(selectedName)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ items?: ComplexListingItem[] }>) : null))
      .then((j) => {
        if (controller.signal.aborted) return;
        if (!j) {
          setComplexListingsStatus("error");
          return;
        }
        setComplexListings(Array.isArray(j.items) ? j.items.slice(0, 12) : []);
        setComplexListingsStatus("ok");
      })
      .catch(() => {
        if (!controller.signal.aborted) setComplexListingsStatus("error");
      });
    return () => controller.abort();
  }, [detailTab, selectedName]);

  /* ===== SDK 로드 실패/미설정 시 폴백 — 허위 시세 대신 정직한 안내 =====
     기존엔 가짜 지역 시세 버블(동안구 7.1억 등)을 그렸으나, 사실 우선 원칙에 따라
     실데이터가 아닌 수치는 표시하지 않고 "지도를 불러올 수 없어요" 상태로 대체. */
  const gradientFallback = (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef] px-8 text-center">
      <Icon name="🗺" size={34} />
      <div className="text-[15px] font-extrabold text-ink">지도를 불러오지 못했어요</div>
      <p className="max-w-[280px] text-[12px] leading-relaxed text-text-2">
        네트워크 상태를 확인하거나 잠시 후 다시 시도해 주세요. 좌측 목록에서 단지 시세·실거래는
        그대로 확인할 수 있어요.
      </p>
    </div>
  );

  /* ===== 상태 안내 — 한 자리에 모아 쌓는다 ===============================
   *
   * 예전에는 안내 토스트가 저마다 `top: safe + 96px` 에 절대배치돼 있었다.
   * 그 자리는 모바일 검색창(safe + 82px, 높이 44)의 아래쪽 4px 뿐이라, 화면에는
   * 문장의 끝 두 글자만 삐져나왔다(소유자 스크린샷: "보여요"). 하필 그렇게 가려진
   * 게 "거래량 상위 300개 단지만 표시 중" 이라는 절단 안내였다 — 지금 보이는
   * 지도가 전부가 아니라고 말하는 유일한 문장이 가려져 있었던 것이다.
   * **가려진 안내는 없는 안내와 같다.** 게다가 서로 다른 안내 세 개가 같은
   * 좌표를 써서, 둘이 동시에 뜨면 완전히 포개졌다.
   *
   * 그래서 자리를 하나로 합쳤다. 모바일은 하단(‘목록으로 보기’ 위), md 이상은
   * 우측 열이다. 여러 개면 포개지 않고 세로로 쌓는다. 이 자리에 무엇이 오든
   * 다른 오버레이와 겹치지 않는지만 지키면 되고, 안내를 추가할 때 좌표를 새로
   * 고민할 일이 없다.
   */
  const mapNotices: { key: string; text: string }[] = [];
  if (viewportEmpty || clusterFetchStatus === "error") {
    mapNotices.push({
      key: "cluster",
      text:
        clusterFetchStatus === "error"
          ? "일시적 오류로 단지 정보를 불러오지 못했어요 — 잠시 후 다시 시도해 주세요"
          : "관심 단지를 고르면 임장노트·AI 정리·지도 비교로 이어져요 — 이 지역 좌표는 순차 확충 중",
    });
  }
  /* 절단 안내 — 조용히 두면 거짓 화면이 된다.
     · 포인트 모드: 거래량 상위 300개만 그려진 상태 ("이게 전부" 아님)
     · 클러스터 모드(#72 잔여): 소스 좌표 5,000개 하드캡에 걸려 셀 숫자가
       과소집계된 상태 ("이 지역 단지 수"가 실제보다 작게 보임) */
  if (pointsTruncated && !viewportEmpty && clusterFetchStatus === "ok") {
    mapNotices.push({
      key: "truncated",
      text:
        clusterMode === "points"
          ? "거래량 상위 300개 단지만 표시 중 — 더 확대하면 나머지 단지도 보여요"
          : "화면이 넓어 단지 수가 일부만 집계됐어요 — 확대하면 정확해져요",
    });
  }
  /* 정비사업 조회 실패 — 마커가 없는 것과 구분해서 말한다. 이걸 안 그리면
     사용자는 빈 지도를 보고 "여긴 정비사업이 없구나"로 읽는다. 예전에는 우하단
     카드로 띄웠는데 그 자리가 현재 위치 버튼과 겹쳐서, 안내 카드가 버튼을 덮고
     있었다. 안내는 안내 자리로 옮긴다. */
  if (showRedevelopment && redevFailed) {
    mapNotices.push({
      key: "redev-failed",
      text: "정비사업을 불러오지 못했어요 — 잠시 후 다시 시도해 주세요. 사업장이 없다는 뜻은 아니에요",
    });
  }
  if (geoApplied) {
    mapNotices.push({ key: "geo", text: "현재 위치 기준으로 지도를 맞췄어요" });
  }

  /* 매물 레이어 안내(실패 / 빈 인벤토리)는 버튼이 달려 있어 같은 열에 카드로
     쌓는다. 조회 실패와 "재고 없음"을 구분하는 게 이 카드들의 존재 이유다. */
  const listingNoticeKind: "error" | "empty" | null =
    !showListings
      ? null
      : listingFetchStatus === "error"
        ? "error"
        : listingFetchStatus === "ok" && listingItems.length === 0 && !listingPreviewId
          ? "empty"
          : null;
  const listingFilterNarrowed =
    listingDetailFilterActive || listingTradeKey !== "all" || rangeActive;

  /* md 좌측 사이드바(320px)가 열려 있으면 좌하단 범례가 그 사각형 안으로
     들어간다 — 사이드바는 top safe+92 부터 bottom 20 까지, 즉 왼쪽 기둥 전체를
     쓰기 때문이다. 열려 있는 동안만 사이드바 오른쪽(356px)으로 비켜 준다. */
  /* 왼쪽으로 비켜선 범례는 폭이 고정(216px)이라 오른쪽 범례 열까지 밀고
     들어갔다(834폭 실측 8×36px, md 768폭이면 54px). 왼쪽 오프셋만 정하고
     오른쪽 경계를 안 정한 게 원인이라, 최대폭을 우측 예약 열
     (--nz-map-right-lane)에서 빼서 같이 정한다. 자리가 좁으면 줄바꿈으로
     좁아질 뿐 사라지지는 않는다 — 겹침을 없애되 존재를 지우지 않는다. */
  const mdSidebarOpen = !selected && !infoComplex && panelOpen;
  const mdLeftLegendX = mdSidebarOpen
    ? "md:left-[356px] md:max-w-[calc(100vw_-_356px_-_var(--nz-map-right-lane))]"
    : "md:left-5 md:max-w-[calc(100vw_-_20px_-_var(--nz-map-right-lane))]";

  return (
    // fixed inset-0 + 100dvh: 문서 흐름에서 분리해 지도 아래 빈 공간(높이 계산 오차)을 제거.
    // dvh 미지원 브라우저는 inset-0(bottom:0)이 폴백으로 풀스크린 유지.
    <div
      ref={mapWrapRef}
      className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef]"
    >
      <Suspense fallback={null}>
        <WelcomeHandoff />
      </Suspense>
      {/* ===== 실제 네이버 지도 (실패 시 그라데이션 폴백) ===== */}
      <NaverMap
        markers={markers}
        center={center}
        level={level}
        rounded={false}
        showControls={false}
        /* 모바일22 — 지도 화면에 현재 위치 버튼이 아예 없었다(매물 등록 폼에만
           있었음). 한 손 조작 반경(우하단)·44px·탭바 위. 위치 권한은 버튼을
           누른 순간에만 요청된다(NaverMap 내부 — 자동 요청 없음). */
        enableGeolocation
        geolocationButtonPosition="bottom-right"
        /* 말풍선 겹침 정리 — 단지가 몰린 곳에서 값이 서로를 반쯤 가려
           "13.6억" 이 "13.0억" 으로 읽히던 문제. 진 쪽은 지우지 않고 점으로
           접으므로 단지는 그대로 있고 계속 누를 수 있다. */
        declutter
        declutterMaxLabels={60}
        className="absolute inset-0 z-0"
        onMarkerClick={handleMarkerClick}
        onIdle={handleMapIdle}
        fallback={gradientFallback}
        circle={
          radiusMode ? { lat: radiusOrigin.lat, lng: radiusOrigin.lng, radiusM } : null
        }
        onMapClick={mapClickMode ? handleMapClick : undefined}
        measurePath={measurePath}
        onMeasurePointDragEnd={(index, point) => {
          setMeasurePoints((prev) =>
            prev.map((pt, i) => (i === index ? point : pt)),
          );
          setSelectedMeasureIdx(index);
          setMeasureRelocate(false);
        }}
        onMeasurePointClick={(index) => {
          setSelectedMeasureIdx(index);
          setMeasureRelocate(false);
        }}
        routeOverlays={routeOverlays}
        onRadiusCenterDragEnd={(point) => {
          setRadiusCenter(point);
        }}
        onRadiusEdgeDragEnd={(nextM) => {
          setRadiusM(nextM);
          setRadiusCenter((c) => c ?? radiusOrigin);
        }}
        crosshair={mapClickMode !== null}
        onMarkerHover={mapClickMode ? undefined : handleMarkerHover}
      />

      {/* ===== 마커 호버 요약 — 누르기 전에 보이는 단지 정보 ===== */}
      {hoverMarker && hoverPos && (
        <div
          className="pointer-events-none absolute z-[46] w-[212px] rounded-[14px] bg-[rgba(255,255,255,.97)] px-3.5 py-3 shadow-[0_12px_30px_rgba(16,28,54,.22)] ring-1 ring-[rgba(16,28,54,.08)]"
          style={{
            // 커서 오른쪽 아래가 기본. 화면 끝에 닿으면 반대편으로 접는다.
            left: Math.min(hoverPos.x + 16, Math.max(8, (mapWrapRef.current?.clientWidth ?? 0) - 220)),
            top: Math.min(hoverPos.y + 16, Math.max(8, (mapWrapRef.current?.clientHeight ?? 0) - 180)),
          }}
        >
          <div className="truncate text-[13px] font-extrabold text-ink">{hoverMarker.label}</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-[17px] font-extrabold text-primary">
              {hoverMarker.priceLabel ?? "시세 준비 중"}
            </span>
            {hoverMarker.momPct !== undefined && Number.isFinite(hoverMarker.momPct) && (
              <span
                className={`text-[11px] font-extrabold ${
                  hoverMarker.momPct >= 0 ? "text-danger" : "text-primary"
                }`}
              >
                {hoverMarker.momPct >= 0 ? "▲" : "▼"}
                {Math.abs(hoverMarker.momPct).toFixed(2)}%
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 border-t border-[rgba(16,28,54,.07)] pt-2">
            <div>
              <div className="text-[9px] text-text-3">세대수</div>
              <div className="text-[12px] font-bold text-ink">
                {hoverMarker.households ? hoverMarker.households.toLocaleString("ko-KR") : "—"}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-text-3">준공</div>
              <div className="text-[12px] font-bold text-ink">
                {hoverMarker.buildYear ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-text-3">평균 전용</div>
              <div className="text-[12px] font-bold text-ink">
                {hoverMarker.avgAreaM2 ? `${Math.round(hoverMarker.avgAreaM2)}㎡` : "—"}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-text-3">클릭하면 자세히 봅니다</div>
        </div>
      )}

      {/* ===== 상태 안내 열 (모바일 하단 · md 우측) =====
           자리를 하나로 합친 이유는 return 위 mapNotices 주석에 적어 두었다.
           모바일 bottom 은 접이식 범례가 펼쳐졌는지에 따라 달라져야 하는데,
           inline style 은 md: 클래스를 덮어쓰므로 값만 CSS 변수로 넘기고
           위치는 클래스로 지정한다. */}
      {(mapNotices.length > 0 || listingNoticeKind) && (
        <div
          className="pointer-events-none absolute bottom-[var(--nz-notice-bottom)] left-4 right-[68px] z-40 flex flex-col items-start gap-1.5 md:bottom-auto md:left-auto md:right-5 md:top-[calc(env(safe-area-inset-top,0px)+176px)] md:w-[320px] md:items-stretch"
          style={
            {
              "--nz-notice-bottom": mobileLegendOpen
                ? "calc(env(safe-area-inset-bottom, 0px) + 226px)"
                : "calc(env(safe-area-inset-bottom, 0px) + 142px)",
            } as CSSProperties
          }
        >
          {mapNotices.map((n) => (
            <div
              key={n.key}
              role="status"
              className="max-w-full rounded-[14px] bg-[rgba(16,28,54,.82)] px-3.5 py-2 text-[12px] font-semibold leading-[1.5] text-white shadow-[0_6px_18px_rgba(16,28,54,.25)]"
            >
              {n.text}
            </div>
          ))}

          {listingNoticeKind === "error" && (
            <div className="glass pointer-events-auto max-w-full rounded-xl px-3.5 py-2.5">
              <div className="text-[12px] font-extrabold text-ink">매물을 불러오지 못했어요</div>
              <div className="mt-0.5 text-[11px] leading-[1.55] text-text-3">
                일시적 오류예요. 매물이 없다는 뜻은 아닙니다. 잠시 후 지도를 조금 옮기거나 다시
                시도해 주세요.
              </div>
            </div>
          )}

          {listingNoticeKind === "empty" && (
            <div className="glass pointer-events-auto max-w-full rounded-xl px-3.5 py-2.5">
              <div className="text-[12px] font-extrabold text-ink">
                {listingFilterNarrowed
                  ? "조건에 맞는 등록 매물이 없어요"
                  : "이 화면에 등록 매물이 아직 없어요"}
              </div>
              <div className="mt-0.5 text-[11px] leading-[1.55] text-text-3">
                {listingFilterNarrowed
                  ? "필터·예산 조건을 완화하거나, 지도를 넓혀 보세요. 포털처럼 매물이 많은 상태가 아니라 승인된 등록분만 보여요."
                  : "필터 문제가 아니라 아직 쌓인 재고가 적어요. 단지 실거래 마커는 그대로 볼 수 있고, 매물을 올리면 여기 표시돼요."}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {listingFilterNarrowed && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-full border border-[#e2e7ee] bg-surface px-2.5 py-1 text-[11px] font-bold text-text-2"
                  >
                    필터 초기화
                  </button>
                )}
                <Link
                  href="/listings/new"
                  className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-extrabold text-white"
                >
                  매물 등록하기
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 상단 플로팅 글래스 헤더 (카메라섬 아래로 세이프에어리어 오프셋) ===== */}
      <div
        className="glass-strong absolute left-1/2 z-40 flex h-[58px] w-[calc(100%-32px)] max-w-[1180px] -translate-x-1/2 items-center gap-4 rounded-[18px] px-5"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>
        {/* 단지·주소 검색 (item1) — 헤더 인라인 (md+) */}
        <div className="hidden w-[280px] md:block">
          <MapSearchBox
            variant="header"
            placeholder={`아파트명·주소 (예: ${regionLabel})`}
            onSelectComplex={handleSearchSelectComplex}
            onSelectAddress={handleSearchSelectAddress}
          />
        </div>
        {/* 매매/전세는 filterBar 안의 실제 토글 — 장식용 칩이었던 것을 배선(item2) */}
        <div className="hidden items-center gap-1.5 lg:flex">{filterBar}</div>
        <div className="flex-1" />
        {/* 줌 단계 탭 (xl+) — 지도 위에 떠서 우측 마커 라벨(과천제이드자이류 가격
            알약)을 덮던 것을, 이 폭에서는 비어 있던 헤더 가운데로 올린다.
            1024~1279 는 filterBar 까지 넣으면 1180 폭이 모자라 플로팅 판을 유지.
            줌 레벨 설명(ZOOM_CAPTION)은 title 로 남긴다 — 캡션 상자까지 올리면
            헤더가 두 줄이 된다. */}
        <div
          className="hidden shrink-0 items-center gap-0.5 rounded-full bg-[rgba(16,28,54,.05)] p-1 xl:flex"
          title={ZOOM_CAPTION[zoom]}
        >
          {ZOOM_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => handleZoomTab(t.key)}
              className={`chip px-3 py-1.5 text-xs transition-colors ${
                zoom === t.key ? "bg-[rgba(29,79,216,.12)] font-bold text-primary" : "text-text-1"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Link
            href={
              regionLabel.trim()
                ? `/notes/new?region=${encodeURIComponent(regionLabel.trim())}`
                : "/notes/new"
            }
            data-tour="map-note-cta"
            className="btn-primary btn-cta rounded-xl px-4 py-[9px] text-[13px]"
          >
            이 지역 노트 쓰기
          </Link>
          {/* "기록 → AI → 비교" 는 무엇의 기록인지·어디서 비교하는지 안 읽혔다
              (소유자 개선 요청 2026-08-10). 노트→AI 정리→지도 비교 흐름을 그대로 적는다. */}
          <span
            className="hidden text-[10px] font-semibold text-text-3 lg:inline"
            title="임장노트에 남긴 기록을 AI가 정리하고, 이 지도에서 실거래 시세와 비교합니다"
          >
            기록 → AI 정리 → 지도 비교
          </span>
        </div>
      </div>

      {/* ===== 모바일 검색 (md 미만) — 패널 열려 있으면 숨김 ===== */}
      {!selected && !infoComplex && (
        <div
          className="absolute left-4 right-4 z-40 md:hidden"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 82px)" }}
        >
          <MapSearchBox
            variant="floating"
            onSelectComplex={handleSearchSelectComplex}
            onSelectAddress={handleSearchSelectAddress}
          />
        </div>
      )}

      {/* ===== 필터 바 (lg 미만 — lg 이상은 헤더에 표시) =====
           상단 오버레이는 서로 겹치지 않는 가로줄(레인)로 나눠 둔다. 값은
           safe-area-inset-top 기준이다.
             헤더   16 ~  74
             검색바 82 ~ 126 (모바일)
             줌 탭 128 ~ 166
             필터 칩 176 ~ 206  ← 여기
             필터 패널 218 ~
           예전에는 칩 줄이 140 이라 줌 탭(128~166)과 세로로 겹쳤고, 오른쪽 끝이
           막히지 않아 '매물'·'필터' 칩이 탭 아래로 들어가 눌리지 않았다.
           (소유자 스크린샷: 시·군·구 알약이 매물 칩을 절반쯤 덮은 상태)
           md 이상은 검색바가 헤더 안으로 들어가 그 레인이 비므로 88 을 쓴다.
           inline style 은 반응형 top 클래스를 덮어쓰므로 top 은 클래스로만 준다. */}
      {!selected && (
        <div className="scroll-x-hidden-bar absolute left-4 right-4 top-[calc(env(safe-area-inset-top,0px)+176px)] z-30 flex items-center gap-1.5 py-0.5 md:left-[356px] md:right-[240px] md:top-[calc(env(safe-area-inset-top,0px)+88px)] lg:hidden [&>*]:shrink-0">
          {filterBar}
        </div>
      )}

      {/* ===== 상세 필터 확장 패널 (item3) — 접이식·모바일 친화 =====
           md 상단이 184 였을 때 우상단 줌 캡션(top 168~195, right-5)의 왼쪽
           64×11px 을 덮었다 — 768폭에서는 패널 오른쪽 끝이 664 까지 와서 캡션
           시작점(600)을 지나기 때문이다. 캡션을 숨기는 대신 패널을 캡션 아래
           204 로 내린다. 겹침을 없애되 존재를 지우지 않는다. */}
      {filtersExpanded && (
        <div
          className="absolute left-4 top-[calc(env(safe-area-inset-top,0px)+218px)] z-[41] w-[300px] max-w-[calc(100vw_-_32px)] [--nz-filter-max-h:calc(100dvh_-_env(safe-area-inset-top,0px)_-_218px_-_var(--nz-map-bottom-lane)_-_8px)] md:left-[var(--nz-filter-left)] md:top-[calc(env(safe-area-inset-top,0px)+204px)] md:max-w-[calc(100vw_-_var(--nz-filter-left)_-_16px)] md:[--nz-filter-max-h:calc(100dvh_-_env(safe-area-inset-top,0px)_-_204px_-_var(--nz-map-bottom-lane)_-_8px)] lg:left-[var(--nz-filter-left-lg)] lg:max-w-[calc(100vw_-_var(--nz-filter-left-lg)_-_16px)]"
          style={
            {
              "--nz-filter-left": `${filterLeftMdPx}px`,
              "--nz-filter-left-lg": `${filterLeftLgPx}px`,
            } as CSSProperties
          }
        >
          {filterPanel}
        </div>
      )}

      {/* 현재 위치 안내는 위쪽 상태 안내 열(mapNotices)에서 함께 쌓는다 —
          예전에는 절단 안내와 같은 좌표를 써서 둘이 동시에 뜨면 포개졌다. */}

      {/* ===== 반경 · 거리 재기 안내/결과 ===== */}
      {mapClickMode && (
        <div
          className="glass-strong absolute right-3 z-[42] flex max-h-[min(70dvh,520px)] w-[min(280px,calc(100vw-24px))] flex-col gap-2 overflow-y-auto rounded-[16px] px-3.5 py-3 shadow-[0_12px_32px_rgba(16,28,54,.18)] sm:right-5"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 212px)" }}
        >
          {mapClickMode === "radius" ? (
            <>
              <div className="text-[12px] font-extrabold text-ink">반경 보기</div>
              <p className="text-[11px] leading-[1.55] text-text-3">
                {radiusCenter
                  ? "중심·크기 핸들을 드래그하거나, 지도를 클릭해 중심을 옮겨요."
                  : "지도를 클릭해 중심을 찍으세요. 안 찍으면 화면 중앙 기준입니다."}
              </p>
              <div className="rounded-[10px] bg-[rgba(29,79,216,.07)] px-2.5 py-2 text-[11px] font-bold text-primary">
                반경 {radiusM >= 1000 ? `${radiusM / 1000}km` : `${radiusM}m`} 안 단지 표시
              </div>
              <label className="flex items-center gap-2 text-[11px] text-text-2">
                <span className="shrink-0 font-bold">직접 입력</span>
                <input
                  type="number"
                  min={100}
                  max={5000}
                  step={50}
                  value={radiusM}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    setRadiusM(Math.min(5000, Math.max(100, Math.round(n))));
                  }}
                  className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] font-bold text-ink"
                  aria-label="반경 미터"
                />
                <span className="text-text-3">m</span>
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setRadiusCenter(null)}
                  className="flex-1 rounded-[9px] border border-line px-2 py-1.5 text-[11px] font-bold text-text-2"
                >
                  중심 삭제
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRadiusCenter(center);
                  }}
                  className="flex-1 rounded-[9px] border border-line px-2 py-1.5 text-[11px] font-bold text-text-2"
                >
                  화면 중앙으로
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-extrabold text-ink">거리 재기</span>
                <span className="text-[10px] text-text-3">{measurePoints.length}개 지점</span>
              </div>
              <p className="text-[11px] leading-[1.55] text-text-3">
                {measureRelocate
                  ? "지도를 클릭하면 선택한 지점이 그곳으로 옮겨져요."
                  : "클릭으로 지점 추가 · 번호 드래그로 이동 · 탭해서 선택 후 수정/삭제"}
              </p>
              {measurePoints.length < 2 ? (
                <p className="text-[11px] leading-[1.55] text-text-3">
                  두 지점 이상이면 직선·차량·도보 거리를 보여 드려요.
                </p>
              ) : (
                <>
                  <div className="rounded-[10px] bg-[rgba(29,79,216,.07)] px-2.5 py-2">
                    <div className="text-[10px] text-text-3">직선 (실선)</div>
                    <div className="text-[15px] font-extrabold text-primary">
                      {formatDistanceM(measureStraightM)}
                    </div>
                  </div>
                  {routeLoading && (
                    <div className="text-[10px] text-text-3">차량·도보 경로 찾는 중…</div>
                  )}
                  {routeError && (
                    <div className="text-[10px] text-danger">{routeError}</div>
                  )}
                  {routeResult?.driving && (
                    <button
                      type="button"
                      onClick={() => setShowDrivingRoute((v) => !v)}
                      className={`rounded-[10px] px-2.5 py-2 text-left ${
                        showDrivingRoute
                          ? "bg-[rgba(230,126,34,.12)]"
                          : "bg-[#f5f7fb]"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-text-3">
                        <span>차량 (주황 점선)</span>
                        <span>{showDrivingRoute ? "표시" : "숨김"}</span>
                      </div>
                      <div className="text-[13px] font-extrabold text-[#c8640a]">
                        {formatDistanceM(routeResult.driving.distanceM)} · 약{" "}
                        {routeResult.driving.durationMin}분
                      </div>
                    </button>
                  )}
                  {!routeLoading && !routeResult?.driving && measurePoints.length >= 2 && (
                    <div className="rounded-[10px] bg-[#f5f7fb] px-2.5 py-2 text-[10px] text-text-3">
                      차량 경로 API 미연동 또는 조회 불가 — 직선만 표시
                    </div>
                  )}
                  {routeResult?.walking && (
                    <button
                      type="button"
                      onClick={() => setShowWalkingRoute((v) => !v)}
                      className={`rounded-[10px] px-2.5 py-2 text-left ${
                        showWalkingRoute
                          ? "bg-[rgba(13,148,136,.12)]"
                          : "bg-[#f5f7fb]"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-text-3">
                        <span>
                          도보{" "}
                          {routeResult.walking.basis === "estimate" ? "추정" : ""}{" "}
                          (청록 점선)
                        </span>
                        <span>{showWalkingRoute ? "표시" : "숨김"}</span>
                      </div>
                      <div className="text-[13px] font-extrabold text-[#0f766e]">
                        {formatDistanceM(routeResult.walking.distanceM)} · 약{" "}
                        {routeResult.walking.durationMin}분
                      </div>
                    </button>
                  )}
                  {measureLegs.length > 1 && (
                    <div className="flex flex-col gap-0.5">
                      {measureLegs.map((l) => (
                        <div
                          key={`${l.from}-${l.to}`}
                          className="flex items-center justify-between text-[11px] text-text-2"
                        >
                          <span>
                            {l.from} → {l.to}
                          </span>
                          <span className="font-bold text-text-1">
                            {formatDistanceM(l.meters)}
                          </span>
                        </div>
                      ))}
                      <div className="mt-0.5 flex items-center justify-between border-t border-[rgba(16,28,54,.08)] pt-1 text-[11px]">
                        <span className="text-text-3">이어 잰 합계</span>
                        <span className="font-extrabold text-ink">
                          {formatDistanceM(measureTotalM)}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedMeasureIdx != null && (
                <div className="rounded-[10px] border border-primary/30 bg-[rgba(29,79,216,.06)] px-2.5 py-2">
                  <div className="text-[11px] font-bold text-ink">
                    지점 {selectedMeasureIdx + 1} 선택됨
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMeasureRelocate(true)}
                      className="flex-1 rounded-[8px] bg-primary px-2 py-1.5 text-[11px] font-extrabold text-white"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedMeasurePoint}
                      className="flex-1 rounded-[8px] border border-danger/40 bg-danger-soft px-2 py-1.5 text-[11px] font-extrabold text-danger"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMeasurePoints((p) => p.slice(0, -1));
                    setSelectedMeasureIdx(null);
                    setMeasureRelocate(false);
                  }}
                  disabled={measurePoints.length === 0}
                  className="flex-1 rounded-[9px] border border-line px-2 py-1.5 text-[11px] font-bold text-text-2 disabled:opacity-40"
                >
                  되돌리기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMeasurePoints([]);
                    setSelectedMeasureIdx(null);
                    setMeasureRelocate(false);
                    setRouteResult(null);
                  }}
                  disabled={measurePoints.length === 0}
                  className="flex-1 rounded-[9px] border border-line px-2 py-1.5 text-[11px] font-bold text-text-2 disabled:opacity-40"
                >
                  전체 삭제
                </button>
              </div>

              {measurePoints.length >= 2 && (
                <div className="flex flex-col gap-1.5 border-t border-[rgba(16,28,54,.08)] pt-2">
                  <div className="text-[10px] font-bold text-text-3">액션</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copyMeasureSummary()}
                      className="rounded-[9px] border border-line px-2 py-1.5 text-[11px] font-bold text-text-2"
                    >
                      거리 복사
                    </button>
                    <button
                      type="button"
                      onClick={() => openExternalDirections("car")}
                      className="rounded-[9px] border border-line px-2 py-1.5 text-[11px] font-bold text-text-2"
                    >
                      차량 길찾기
                    </button>
                    <button
                      type="button"
                      onClick={() => openExternalDirections("walk")}
                      className="rounded-[9px] border border-line px-2 py-1.5 text-[11px] font-bold text-text-2"
                    >
                      도보 길찾기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMeasureIdx(0);
                        setMeasureRelocate(true);
                      }}
                      className="rounded-[9px] border border-line px-2 py-1.5 text-[11px] font-bold text-text-2"
                    >
                      시작점 수정
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setRadiusMode(false);
              setRadiusCenter(null);
              setMeasureMode(false);
              setMeasurePoints([]);
              setSelectedMeasureIdx(null);
              setMeasureRelocate(false);
              setRouteResult(null);
            }}
            className="rounded-[9px] bg-[rgba(16,28,54,.06)] px-2 py-1.5 text-[11px] font-bold text-text-2"
          >
            끝내기
          </button>
        </div>
      )}

      {/* ===== 줌 레벨 탭 (xl 미만 — xl 이상은 헤더에 표시) =====
           지도 위 플로팅 판은 우측 마커 라벨 위에 뜬다. 넓은 화면은 헤더로
           올렸고(위 헤더 블록), 이 판은 헤더에 자리가 없는 폭에서만 남는다. */}
      <div
        className="glass absolute right-5 z-30 mt-9 flex items-center gap-0.5 rounded-full p-1 md:mt-0 md:translate-y-9 xl:hidden"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 92px)" }}
      >
        {ZOOM_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleZoomTab(t.key)}
            className={`chip px-3 py-1.5 text-xs transition-colors ${
              zoom === t.key ? "bg-[rgba(29,79,216,.12)] font-bold text-primary" : "text-text-1"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="absolute right-5 top-[92px] z-30 hidden translate-y-[76px] rounded-lg bg-[rgba(255,255,255,.8)] px-2.5 py-[5px] text-[11px] text-text-3 md:block xl:hidden">
        {ZOOM_CAPTION[zoom]}
      </div>

      {/* 줌별 하단 정보 오버레이(보는 사람 수·전문가 수·조회수·급매 등)는
          집계 소스가 없어 허위 수치였으므로 사실 우선 원칙에 따라 제거함. */}

      {/* ===== 좌측 사이드 패널 (320px, 접기 핸들) =====
          단지를 고르면(selected = 목록 클릭, infoComplex = 마커·검색·인기목록 클릭)
          이 목록은 사라지고 같은 자리에 단지 상세가 들어선다. 예전에는 infoComplex
          를 조건에서 빠뜨려, 마커를 눌러도 목록이 그대로 남고 상세가 지도 하단을
          가리는 채로 둘 다 떠 있었다(소유자 지적). */}
      {!selected && !infoComplex && panelOpen && (
        <aside
          data-tour="map-price-panel"
          className="glass-strong absolute bottom-[var(--nz-map-bottom-lane)] left-5 z-30 hidden w-[320px] flex-col overflow-hidden rounded-[20px] md:flex"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 92px)" }}
        >
          <div className="flex items-baseline justify-between px-5 pb-1 pt-4">
            <div className="text-[15px] font-extrabold text-ink">
              {popularScope === "viewport" ? "이 지역 인기 단지" : "전국 인기 단지"}
            </div>
            <div className="text-[11px] text-text-3">최근 거래순</div>
          </div>
          {/* ?region= 으로 들어왔음을 화면에서도 확인할 수 있게 — 관심지역 칩을
              눌렀는데 늘 같은 화면이 뜨던 예전과 달라졌다는 신호. */}
          {focusedRegion && (
            <div className="px-5 pb-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">
                <Icon name="📍" size={11} />
                {focusedRegion}에서 시작
              </span>
            </div>
          )}
          <div className="px-5 pb-2.5 text-[11px] leading-[1.5] text-text-3">
            {popularScope === "viewport"
              ? "지도를 움직이면 보이는 지역 기준으로 바뀝니다"
              : "지도를 확대하면 그 지역 기준으로 바뀝니다"}
          </div>
          {popularFailed && (
            <div className="mx-3 mb-2 rounded-[12px] border border-line bg-surface px-3.5 py-3">
              <div className="text-[12px] font-extrabold text-ink">
                인기 단지를 지금 불러오지 못했어요
              </div>
              <p className="mt-1 text-[11px] leading-[1.6] text-text-3">
                이 지역에 단지가 없는 게 아니라 조회가 실패했습니다. 지도는 그대로 쓸 수 있어요.
              </p>
            </div>
          )}
          {danjiLoadFailed && (
            <div className="mx-3 mb-2 rounded-[12px] border border-line bg-surface px-3.5 py-3">
              <div className="text-[12px] font-extrabold text-ink">
                단지 목록을 지금 불러오지 못했어요
              </div>
              <p className="mt-1 text-[11px] leading-[1.6] text-text-3">
                이 지역에 단지가 0개인 게 아니라 조회 자체가 실패했습니다. 지도는 그대로 쓸 수
                있어요 — 잠시 후 새로고침해 주세요.
              </p>
            </div>
          )}
          {!danjiLoadFailed && regionMarkersLoadFailed && (
            <div className="mx-3 mb-2 rounded-[12px] border border-line bg-surface px-3.5 py-3">
              <div className="text-[12px] font-extrabold text-ink">
                지역 시세 말풍선을 불러오지 못했어요
              </div>
              <p className="mt-1 text-[11px] leading-[1.6] text-text-3">
                거래가 없는 게 아니라 조회가 실패했습니다. 단지 목록과 지도는 그대로 쓸 수 있어요.
              </p>
            </div>
          )}
          {txType === "rent" && (
            <div className="px-5 pb-1.5 text-[10px] text-text-3">
              목록 가격은 매매 실거래 평균이에요 — 전세 보증금은 지도 마커에서 확인
            </div>
          )}
          {!danjiLoadFailed && (rangeActive || commuteActive) && filteredDanji.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
              <div className="text-xs text-text-2">조건에 맞는 단지가 없어요.</div>
              <button
                type="button"
                onClick={resetFilters}
                className="btn-soft rounded-lg px-3 py-1.5 text-[11px]"
              >
                필터 초기화
              </button>
            </div>
          )}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3">
            {!popularFailed && !popularLoading && popular.length === 0 && (
              <div className="px-2 py-6 text-center text-[12px] leading-[1.7] text-text-3">
                이 영역에는 실거래가 기록된 단지가 없어요.
                <br />
                지도를 넓히거나 다른 지역으로 옮겨 보세요.
              </div>
            )}
            {popular.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openInfoPanel(p.id, p.name, p.lat, p.lng)}
                /* 선택 상태 테두리는 두지 않는다 — 이 목록은 아무것도 선택되지
                   않았을 때만 그려지므로(위 조건) 선택된 항목이 있을 수 없다. */
                className={`rise-in-${Math.min(i + 1, 6)} card-hover flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 text-left`}
              >
                {/* 순위를 눈에 보이게 — "왜 이 순서인가"가 목록의 뜻이다 */}
                <span
                  className={`shrink-0 text-[13px] font-extrabold ${
                    i < 3 ? "text-primary" : "text-text-3"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-ink">{p.name}</span>
                  <span className="mt-0.5 block text-[11px] text-text-3">{p.regionName}</span>
                </span>
                <span className="shrink-0 text-right">
                  {/* 순위 근거를 그대로 적는다 — 숨은 점수로 줄 세우지 않는다 */}
                  <span className="block text-[13px] font-extrabold text-ink">
                    {p.recentTradeCount.toLocaleString("ko-KR")}건
                  </span>
                  <span className="block text-[10px] text-text-3">최근 6개월</span>
                </span>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* ===== 모바일 목록 뷰 (지도↔목록 전환) — 데스크탑은 좌측 패널이 담당 ===== */}
      {mobileView === "list" && !selected && (
        <div
          className="absolute inset-x-0 bottom-0 z-30 flex flex-col bg-bg md:hidden"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 86px)" }}
        >
          <div className="flex items-baseline justify-between px-5 pb-2 pt-3">
            <div className="text-[15px] font-extrabold text-ink">
              {regionLabel} 단지 {danjiLoadFailed ? "—" : filteredDanji.length}
              {!danjiLoadFailed && (rangeActive || commuteActive) && (
                <span className="ml-1 text-[11px] font-bold text-primary">필터 적용</span>
              )}
            </div>
            <span className="text-[11px] text-text-3">국토부 실거래 평균</span>
          </div>
          {filteredDanji.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              {/* 2026-07-26: 조회 실패도 여기로 떨어져서 "이 지역 단지 목록을 준비 중이에요"
                  라고 안내했다 — 수집이 안 된 것과 못 읽은 것은 전혀 다른 사건이다. */}
              <div className="text-xs text-text-2">
                {danjiLoadFailed
                  ? "단지 목록을 지금 불러오지 못했어요. 단지가 0개인 게 아니라 조회가 실패했습니다."
                  : rangeActive || commuteActive
                    ? "조건에 맞는 단지가 없어요."
                    : "이 지역 단지 목록을 준비 중이에요."}
              </div>
              {!danjiLoadFailed && (rangeActive || commuteActive) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="btn-soft rounded-lg px-3 py-1.5 text-[11px]"
                >
                  필터 초기화
                </button>
              )}
            </div>
          ) : (
            <div
              className="flex flex-1 flex-col gap-2 overflow-y-auto px-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}
            >
              {filteredDanji.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    selectDanji(d.id);
                    setMobileView("map"); // 상세 패널이 지도 위에 뜨므로 지도로 복귀
                  }}
                  className="card flex flex-col gap-1.5 rounded-[14px] bg-surface px-4 py-3.5 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[15px] font-bold text-ink">{d.name}</div>
                    <span className="text-xs text-text-3">{d.size}</span>
                  </div>
                  <div className="text-xs text-text-3">{d.meta}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[17px] font-extrabold text-ink">{d.price}</span>
                    <span className={`text-xs ${deltaClass(d.deltaTone)}`}>{d.delta}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 모바일 지도↔목록 토글 (탭바 위 플로팅) */}
      {/* 상세 필터 패널이 열려 있으면 숨긴다 — 패널이 이 버튼(131~271 × 737~778)
          위에 그대로 덮여(실측 140×41px) 눌리지 않는다. */}
      {!selected && !filtersExpanded && (
        <button
          type="button"
          onClick={() => setMobileView((v) => (v === "map" ? "list" : "map"))}
          className="glass-strong absolute left-1/2 z-40 -translate-x-1/2 rounded-full px-5 py-2.5 text-[13px] font-extrabold text-ink shadow-[0_8px_22px_rgba(16,28,54,.2)] md:hidden"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}
        >
          {mobileView === "map" ? "☰ 목록으로 보기" : "🗺 지도로 보기"}
        </button>
      )}

      {/* 접기 핸들 ‹ */}
      {!selected && (
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-label={panelOpen ? "패널 접기" : "패널 열기"}
          className={`absolute top-1/2 z-30 hidden h-16 w-4 -translate-y-1/2 items-center justify-center rounded-r-xl border border-[rgba(255,255,255,.95)] bg-[rgba(255,255,255,.92)] text-[11px] text-text-3 shadow-[6px_0_14px_rgba(16,28,54,.08)] md:flex ${
            panelOpen ? "left-[340px]" : "left-0"
          }`}
        >
          {panelOpen ? "‹" : "›"}
        </button>
      )}

      {/* ===== 단지 클릭 → 상세 팝업 =====
           예전에는 좌측에 460px 세로 패널로 붙였다. 폭이 좁아 표·그래프가 다
           눌렸고, 같은 자리를 쓰는 필터·인기 단지 패널과 계속 부딪혔다(소유자 지적).
           화면 가운데 큰 팝업으로 띄우면 두 문제가 같이 사라진다. 더 깊이 보고
           싶으면 아래 "전체 화면으로 자세히 보기"로 단지 홈 페이지로 넘어간다. */}
      {selected && (
        <div
          className="absolute inset-0 z-[48] flex items-center justify-center px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${selected.name} 단지 상세`}
        >
          <button
            type="button"
            aria-label="상세 닫기"
            onClick={() => setSelectedId(null)}
            className="absolute inset-0 h-full w-full cursor-default bg-[rgba(11,20,40,.45)]"
          />
          <aside className="glass-strong rise-in relative z-10 flex max-h-[min(88dvh,860px)] w-full max-w-[860px] flex-col overflow-hidden rounded-[24px] shadow-[0_28px_70px_rgba(16,28,54,.32)]">
          <div className="flex items-start justify-between border-b border-[rgba(16,28,54,.06)] px-[22px] pb-3.5 pt-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[22px] font-extrabold text-ink">{selected.name}</span>
                {selected.note && (
                  <span className="rounded-[5px] bg-primary-soft chip-pad text-[10px] font-extrabold text-primary">
                    내 {selected.note}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-text-2">{selected.meta}</div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/complex/${encodeURIComponent(selected.id)}`}
                className="btn-primary btn-cta hidden rounded-xl px-3.5 py-2 text-xs font-extrabold text-white md:inline-flex"
              >
                전체 화면으로 자세히 보기 ›
              </Link>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="패널 닫기"
                className="text-[15px] text-text-3"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="flex border-b border-[rgba(16,28,54,.06)] px-[22px]">
            {DETAIL_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDetailTab(t)}
                className={`px-3.5 py-[11px] text-[13px] ${
                  detailTab === t
                    ? "border-b-2 border-primary font-extrabold text-primary"
                    : "font-semibold text-text-2"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* 요약은 카드가 많아 넓은 화면에서 두 단으로 흘린다 — 460px 시절에는
              한 줄로 세울 수밖에 없어 스크롤이 길었다. */}
          <div
            className={`flex flex-1 flex-col gap-3 overflow-y-auto px-[22px] py-4 ${
              detailTab === "요약" ? "md:grid md:grid-cols-2 md:content-start md:gap-4" : ""
            }`}
          >
            {detailTab === "요약" && (
              <>
                {/* 사실 우선: 서버 실데이터(시세·전월비)만 표시. 조회수·전문가수·급매·판정은
                    집계 소스가 없어 허위였으므로 제거. */}
                <div className="card rounded-[14px] px-[15px] py-3.5">
                  {/* item3 — 대표가격 근거 병기: 면적 통합 평균 + 언제·몇 건인지 */}
                  <div className="text-[10px] text-text-3">
                    실거래 평균 (면적 통합
                    {selected.latestYm && selected.latestDealCount != null
                      ? ` · ${selected.latestYm} ${selected.latestDealCount}건`
                      : ""}
                    ) · 국토교통부 기준
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-[22px] font-extrabold text-ink">{selected.price}</span>
                    {selected.delta === "표본 부족" ? (
                      // 최신월 3건 미만 — 등락률은 노이즈라 표시하지 않는다
                      <span className="text-xs text-text-3">표본 부족 · 전월비 생략</span>
                    ) : (
                      <span className={`text-xs ${deltaClass(selected.deltaTone)}`}>
                        {selected.delta === "—" ? "— (전월비)" : `${selected.delta} (전월비)`}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/complex/${encodeURIComponent(selected.id)}`}
                  className="flex items-center justify-between rounded-[14px] border border-line bg-surface px-[15px] py-[13px] text-left"
                >
                  <span className="text-[13px] font-bold text-ink">
                    단지 홈에서 실거래 이력·노트 보기
                  </span>
                  <span className="text-xs font-extrabold text-primary">›</span>
                </Link>
                <div className="flex gap-2">
                  <Link
                    href={noteHrefFor(selected)}
                    className="btn-primary btn-cta flex-1 rounded-xl p-[11px] text-center text-xs"
                  >
                    이 단지 임장노트
                  </Link>
                  <Link
                    href={`/analysis?complexId=${encodeURIComponent(selected.id)}`}
                    className="btn-secondary flex-1 rounded-xl p-[11px] text-center text-xs"
                  >
                    AI 분석
                  </Link>
                  {/* 예전엔 <Link href="/notes/compare"> 였다. 단지 식별자가 URL 에
                      없어서 아무것도 담기지 않았고, 도착지는 하드코딩된 예시 표였다.
                      단지 홈이 쓰는 진짜 컨트롤(CompareTrayButton)로 교체. */}
                  <CompareTrayButton
                    complexId={selected.id}
                    name={selected.name}
                    region={selected.note ?? undefined}
                  />
                </div>
              </>
            )}

            {detailTab === "매물" && (
              <div className="flex flex-col gap-3">
                {complexListingsStatus === "loading" && (
                  <div className="card rounded-[14px] px-[15px] py-6 text-center text-[12px] text-text-3">
                    매물을 불러오는 중…
                  </div>
                )}
                {/* 못 읽은 것을 "매물 없음"으로 적지 않는다 — 멀쩡히 올라와 있는
                    남의 매물을 없다고 말하는 셈이 된다. */}
                {complexListingsStatus === "error" && (
                  <div className="card rounded-[14px] px-[15px] py-6 text-center">
                    <div className="text-[13px] font-bold text-ink">매물을 불러오지 못했어요</div>
                    <div className="mt-1 text-[11px] text-text-3">
                      잠시 후 다시 시도해 주세요.
                    </div>
                  </div>
                )}
                {complexListingsStatus === "ok" && complexListings.length > 0 && (
                  <div className="card flex flex-col rounded-[14px] px-[15px] py-1">
                    {complexListings.map((l, i) => (
                      <Link
                        key={l.id}
                        href={`/listings/${encodeURIComponent(l.id)}`}
                        className={`flex items-center justify-between gap-2 py-2.5 ${
                          i < complexListings.length - 1 ? "border-b border-[#f0f3f8]" : ""
                        }`}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[13px] font-bold text-ink">
                            {LISTING_TYPE_LABEL[l.listingType]} {listingPriceLabel(l)}
                          </span>
                          <span className="truncate text-[11px] text-text-3">
                            {[
                              l.areaM2 ? `${Math.round(l.areaM2)}㎡` : null,
                              l.floor != null ? `${l.floor}층` : null,
                              l.ownerVerified ? "소유 확인" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "상세 보기"}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-extrabold text-primary">›</span>
                      </Link>
                    ))}
                  </div>
                )}
                {complexListingsStatus === "ok" && complexListings.length === 0 && (
                  <div className="card rounded-[14px] px-[15px] py-6 text-center">
                    <div className="text-[13px] font-bold text-ink">
                      이 단지에 등록된 매물이 아직 없어요
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-text-3">
                      지도 상단의 “매물” 레이어를 켜면 주변 단지의 등록 매물을 볼 수 있어요.
                    </div>
                  </div>
                )}
                <Link href="/listings/new" className="btn-soft rounded-xl p-3 text-center text-[13px]">
                  내 매물 등록하기
                </Link>
              </div>
            )}

            {detailTab === "실거래" && (
              <>
                <div className="px-1 text-[11px] font-bold text-text-3">
                  국토교통부 실거래가 기준
                </div>
                {trades.length > 0 ? (
                  <div className="card flex flex-col rounded-[14px] px-[15px] py-2">
                    {trades.map((t, i) => (
                      <div
                        key={`${t.date}-${i}`}
                        className={`flex items-center justify-between py-2.5 text-[13px] ${
                          i < trades.length - 1 ? "border-b border-[#f0f3f8]" : ""
                        }`}
                      >
                        <span className="text-text-2">
                          {t.date} · {t.sub}
                        </span>
                        <span className="flex items-baseline gap-2">
                          <span className="font-extrabold text-ink">{t.price}</span>
                          <span className={`text-[11px] ${deltaClass(t.tone)}`}>{t.delta}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="card rounded-[14px] px-[15px] py-6 text-center text-[13px] text-text-3">
                    아직 수집된 국토교통부 실거래가 없어요
                  </div>
                )}
              </>
            )}

            {detailTab === "노트" && (
              <>
                {/* item9 — inspection_notes 단지명 매칭 실조회. 없으면 정직한 빈 상태 + 실링크 */}
                {complexNotesStatus === "loading" && (
                  <div className="card rounded-[14px] px-[15px] py-6 text-center text-[13px] text-text-3">
                    이 단지 임장노트를 찾는 중…
                  </div>
                )}
                {complexNotesStatus === "error" && (
                  <div className="card rounded-[14px] px-[15px] py-6 text-center text-[13px] text-text-3">
                    일시적 오류로 노트를 불러오지 못했어요
                  </div>
                )}
                {complexNotesStatus === "ok" && complexNotes.length > 0 && (
                  <div className="card flex flex-col rounded-[14px] px-[15px] py-1">
                    {complexNotes.map((n, i) => (
                      <Link
                        key={n.id}
                        href={`/notes/${encodeURIComponent(n.id)}`}
                        className={`flex items-center justify-between gap-2 py-2.5 text-[13px] ${
                          i < complexNotes.length - 1 ? "border-b border-[#f0f3f8]" : ""
                        }`}
                      >
                        <span className="min-w-0 truncate font-bold text-ink">
                          {n.mine && (
                            <span className="mr-1.5 rounded-[4px] bg-primary-soft chip-pad-tight text-[10px] font-extrabold text-primary">
                              내 노트
                            </span>
                          )}
                          {n.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-text-3">
                          {n.visitDate ?? ""}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
                {complexNotesStatus === "ok" && complexNotes.length === 0 && (
                  <div className="card rounded-[14px] px-[15px] py-6 text-center text-[13px] text-text-3">
                    아직 이 단지의 임장노트가 없어요 — 첫 노트 → AI 요약 → 지도
                    비교로 이어져요
                  </div>
                )}
                <div className="flex gap-2">
                  <Link
                    href={noteHrefFor(selected)}
                    className="btn-primary btn-cta flex-1 rounded-xl p-3 text-center text-[13px]"
                  >
                    이 단지 노트 쓰기
                  </Link>
                  <Link
                    href="/notes"
                    className="btn-soft flex-1 rounded-xl p-3 text-center text-[13px]"
                  >
                    공개 노트 모아보기
                  </Link>
                </div>
              </>
            )}

            {detailTab === "이야기" && (
              <>
                {/* 사실 우선: 하드코딩 Q&A 제거 — 동네이야기로 연결 */}
                <div className="card rounded-[14px] px-[15px] py-6 text-center text-[13px] text-text-3">
                  이 지역의 질문·이야기를 동네이야기에서 확인해 보세요
                </div>
                <Link href="/town" className="btn-soft rounded-xl p-3 text-center text-[13px]">
                  동네이야기 보기
                </Link>
              </>
            )}
          </div>
          {/* 모바일에서는 헤더에 넣을 자리가 없어 아래에 고정 CTA 로 둔다. */}
          <div className="border-t border-[rgba(16,28,54,.06)] px-[22px] py-3 md:hidden">
            <Link
              href={`/complex/${encodeURIComponent(selected.id)}`}
              className="btn-primary btn-cta block rounded-xl p-3 text-center text-[13px] font-extrabold text-white"
            >
              전체 화면으로 자세히 보기 ›
            </Link>
          </div>
          </aside>
        </div>
      )}

      {/* ===== 단지 정보 패널 (item2) — 검색/포인트 선택 시 실데이터 하단 시트 ===== */}
      {infoComplex && (
        <ComplexInfoPanel
          complexId={infoComplex.id}
          initialName={infoComplex.name}
          focusNoteId={focusNoteId}
          onClose={closeInfoPanel}
          onLoaded={handleInfoLoaded}
        />
      )}

      {/* ===== 매물 미리보기 패널 (하단 시트) ===== */}
      {listingPreviewId && (
        <ListingPreviewPanel
          listingId={listingPreviewId}
          onClose={() => setListingPreviewId(null)}
        />
      )}

      {/* ===== 우하단 세로 스택 =====
           safe-area-inset-bottom 기준으로 위로 쌓는다. 겹치지 않게 한 번에 적어 둔다.
             현재 위치 ◎ (NaverMap 내장)  78 ~ 122
             줌 컨트롤 ＋ －             134 ~ 208
             매물 등록                   220 ~ 264
           예전에는 여기 ◎ 가 두 개였다. NaverMap 의 44px 버튼(78~122)과 아래 줌
           열의 34px ◎(88~122)가 같은 자리에 겹쳐 그려져, 실제로는 위에 있는 하나만
           눌렸다. 그런데 가려진 쪽(줌 열)이 아니라 보이는 쪽이 더 나은 구현이라
           다행이었을 뿐이다 — 줌 열 버튼은 확대도 하지 않고, 위치 실패를 알려 주지도
           않으며, center 상태가 그대로면 두 번째 누름이 아무 일도 하지 않았다.
           그래서 줌 열의 ◎ 를 지우고 NaverMap 것만 남긴다. */}
      <Link
        href="/listings/new"
        aria-label="매물 등록"
        /* 모바일(402폭)에서 상세 필터 패널은 16~316 을 차지하고 이 버튼은
           272~382 이라 44×43px 이 겹친다. md 768폭에서도 패널(364~664)이 이
           버튼(638~748)의 왼쪽 26px 을 덮었다(실측 26×43px). 패널이 떠 있는
           동안은 lg 이상에서만 둔다 — 덮인 버튼은 눌리지 않으면서 눌릴 것처럼
           보인다. lg 에서는 패널이 200~500 이라 겹치지 않는다. */
        className={`btn-primary btn-cta absolute right-5 z-30 items-center gap-1.5 rounded-full px-4 py-3 text-[13px] font-extrabold text-white shadow-[0_10px_28px_rgba(29,79,216,.42)] ${
          filtersExpanded ? "hidden lg:flex" : "flex"
        }`}
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 220px)" }}
      >
        <span className="text-base leading-none">＋</span>
        매물 등록
      </Link>

      {/* ===== 우하단 줌 컨트롤 ===== */}
      <div
        className="absolute right-5 z-30 flex flex-col gap-1.5"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 134px)" }}
      >
        <button
          type="button"
          aria-label="확대"
          onClick={() => setLevel((v) => Math.max(1, v - 1))}
          className="glass flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-[15px] text-text-1"
        >
          ＋
        </button>
        <button
          type="button"
          aria-label="축소"
          onClick={() => setLevel((v) => Math.min(14, v + 1))}
          className="glass flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-[15px] text-text-1"
        >
          －
        </button>
      </div>

      {/* ===== 우하단 범례 열 (md+) — 기본 범례 + 정비사업 종류 =====
           예전에는 둘을 각각 bottom 오프셋(20 / 60)으로 따로 놓아, 정비사업
           범례가 길어지면 줌 컨트롤 위로 올라타 서로 겹쳤다. 한 열 안에 쌓으면
           오프셋을 손으로 맞출 일이 없다. right-[70px] 는 34px 줌 열(right-5)을
           피한 값이고, 높이 상한은 매물 등록 버튼(220~) 아래에 머물게 잡았다.
           bottom 은 --nz-map-bottom-lane — bottom-5 였을 때 가운데 카테고리 바가
           이 열의 아래 36px 를 덮었다(834폭 실측 54×36px).
           md 에서 상세 필터 패널(364~664)과 이 열(564~764)은 가로로 겹칠 수밖에
           없어, 패널이 열려 있는 동안은 lg 에서만 보인다. 덮인 채로 두면 읽을 수
           없고, 읽을 수 없는 범례는 없는 것과 같다. */}
      <div
        className={`absolute bottom-[var(--nz-map-bottom-lane)] right-[70px] z-30 hidden w-[200px] max-h-[180px] flex-col items-stretch gap-2 ${
          filtersExpanded ? "lg:flex" : "md:flex"
        }`}
      >
        {showRedevelopment && redevLegend.length > 0 && (
          <div className="glass flex min-h-0 flex-col gap-1.5 overflow-y-auto rounded-xl px-3 py-2.5">
            <div className="text-[11px] font-extrabold text-ink">정비사업 종류</div>
            <div className="flex flex-col gap-1">
              {redevLegend.map((it) => (
                <div
                  key={it.label}
                  className="flex items-center gap-1.5 text-[11px] text-text-1"
                >
                  <span
                    className="h-[9px] w-[9px] shrink-0 rounded-full"
                    style={{ background: it.color }}
                  />
                  <span className="truncate">{it.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="glass flex shrink-0 gap-3.5 rounded-xl px-3.5 py-[9px]">
          <div className="flex items-center gap-1.5 text-[11px] text-text-1">
            <span className="h-[9px] w-[9px] rounded-[3px] bg-primary" />
            임장한 단지
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-text-1">
            <span className="h-[9px] w-[9px] rounded-[3px] border border-[#c3cad6] bg-surface" />
            미방문
          </div>
        </div>
      </div>

      {/* ===== item7 — 모바일 접이식 범례 (기본 접힘). md 전용이던 범례·줌 캡션을 노출 =====
           상세 필터 패널이 열려 있으면 접는다. 패널(16~316 × 218~786)이 이 열을
           통째로 덮어(실측 57×30px) 범례 토글이 보이지도 눌리지도 않는다. */}
      {!filtersExpanded && (
      <div
        className="absolute left-4 z-30 flex flex-col items-start gap-1.5 md:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}
      >
        {mobileLegendOpen && (
          <div className="glass flex w-[196px] flex-col gap-1.5 rounded-xl px-3 py-2.5">
            <div className="text-[11px] font-extrabold text-ink">범례</div>
            <div className="flex items-center gap-1.5 text-[11px] text-text-1">
              <span className="h-[9px] w-[9px] shrink-0 rounded-[3px] bg-primary" />
              임장한 단지 (내 노트 있음)
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-text-1">
              <span className="h-[9px] w-[9px] shrink-0 rounded-[3px] border border-[#c3cad6] bg-surface" />
              미방문
            </div>
            {txType === "rent" ? (
              <div className="flex items-center gap-1.5 text-[11px] text-text-1">
                <span
                  className="h-[9px] w-[9px] shrink-0 rounded-full"
                  style={{ background: JEONSE_MARKER_COLOR }}
                />
                전세 평균 보증금 (단지 줌)
              </div>
            ) : (
              showPriceOverlay && (
                <div className="flex overflow-hidden rounded-[3px]">
                  {PRICE_TIERS.map((t) => (
                    <span
                      key={t.slug}
                      className="h-[8px] flex-1"
                      style={{ background: t.color }}
                      title={t.label}
                    />
                  ))}
                </div>
              )
            )}
            <div className="text-[10px] leading-[1.5] text-text-3">{ZOOM_CAPTION[zoom]}</div>
          </div>
        )}
        <button
          type="button"
          aria-expanded={mobileLegendOpen}
          onClick={() => setMobileLegendOpen((v) => !v)}
          className="glass rounded-full px-3 py-1.5 text-[11px] font-bold text-text-1"
        >
          범례 {mobileLegendOpen ? "▾" : "▸"}
        </button>
      </div>
      )}

      {/* 정비사업 종류 범례(#20)는 위 우하단 범례 열 안으로 옮겼고, 조회 실패
          안내는 상태 안내 열(mapNotices)로 옮겼다. 매물 레이어의 실패/빈 인벤토리
          안내도 같은 열에 있다 — 상단 88px 자리는 모바일 검색창과 md 필터 칩이
          쓰고 있어 카드가 그 아래로 깔렸기 때문이다. */}

      {/* 좌하단 범례 열 — C1 시세 색상 범례(위) + C8 가격 표기 범례(아래).
          예전에는 둘이 각각 absolute 였고, 위 카드가 아래 카드의 높이를 손으로
          적어(`bottom + 88px` = C8 실측 79 + 여백 9) 자리를 잡았다. 폭이 좁아져
          C8 이 한 줄 늘어나는 순간 그 숫자만 조용히 틀려서 두 범례가 24px 겹쳤다
          (768폭 실측 130×24px). 형제의 높이는 짐작하지 말고 레이아웃이 재게 둔다.
          두 범례 모두 상세 필터 패널이 열리면 접는다. 패널은 md 364~664 를
          차지해 이 자리를 통째로 덮는데(실측 216×128px 완전 포함), 덮인 범례는
          읽을 수 없으면서 "지도에 안내가 있다"는 인상만 남긴다. */}
      {!filtersExpanded && (showPriceOverlay || showListings) && (
        <div
          className={`absolute bottom-[var(--nz-map-bottom-lane)] z-30 hidden w-[216px] flex-col gap-[9px] md:flex ${mdLeftLegendX}`}
        >
        {showPriceOverlay && (
        <div className="glass flex flex-col gap-1.5 rounded-xl px-3 py-2.5">
          {txType === "rent" ? (
            <>
              {/* item2 — 전세 모드 범례: 매매 평단가 색표를 보증금에 갖다 붙이지 않는다 */}
              <div className="text-[11px] font-extrabold text-ink">전세 평균 보증금</div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-1">
                <span
                  className="h-[9px] w-[9px] shrink-0 rounded-full"
                  style={{ background: JEONSE_MARKER_COLOR }}
                />
                <span>단지 줌에서 평균 보증금 표시</span>
              </div>
              <div className="text-[10px] leading-[1.5] text-text-3">
                국토교통부 전월세 실거래 중 전세 계약 기준 · 월세 계약 제외
                {ymLabel(priceMeta.latestYm) ? ` · ~${ymLabel(priceMeta.latestYm)} 신고분` : ""}
                {priceMeta.txCount > 0
                  ? ` · 화면 내 ${priceMeta.txCount.toLocaleString("ko-KR")}건`
                  : ""}
              </div>
            </>
          ) : (
            <>
              <div className="text-[11px] font-extrabold text-ink">실거래 평단가 (만원/평)</div>
              <div>
                <div className="flex overflow-hidden rounded-[3px]">
                  {PRICE_TIERS.map((t) => (
                    <span
                      key={t.slug}
                      className="h-[10px] flex-1"
                      style={{ background: t.color }}
                      title={t.label}
                    />
                  ))}
                </div>
                {/* 눈금 — 색이 갈리는 지점을 정확한 값으로 표시 */}
                <div className="relative mt-[3px] h-[12px]">
                  {PRICE_TIERS.slice(1).map((t, i) => (
                    <span
                      key={t.slug}
                      className="absolute top-0 -translate-x-1/2 text-[10px] leading-[12px] text-text-3"
                      style={{ left: `${((i + 1) / PRICE_TIERS.length) * 100}%` }}
                    >
                      {t.minManwon.toLocaleString("ko-KR")}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-1">
                <span
                  className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
                  style={{ background: NO_DATA_COLOR }}
                />
                <span>{NO_DATA_LABEL} (실거래 없음)</span>
              </div>
              <div className="text-[10px] leading-[1.5] text-text-3">
                국토교통부 실거래가(매매) 기준 · 매물 호가 아님
                {ymLabel(priceMeta.latestYm) ? ` · ~${ymLabel(priceMeta.latestYm)} 신고분` : ""}
                {priceMeta.txCount > 0
                  ? ` · 화면 내 ${priceMeta.txCount.toLocaleString("ko-KR")}건`
                  : ""}
              </div>
            </>
          )}
        </div>
        )}
        {/* C8 가격 표기 범례 — 매물(호가) vs 실거래(국토부 확정가) 구분 명시 */}
        {showListings && (
        <div className="glass flex flex-col gap-1 rounded-xl px-3 py-2.5">
          <div className="text-[11px] font-extrabold text-ink">가격 표기 안내</div>
          <div className="flex items-center gap-1.5 text-[11px] text-text-1">
            <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-primary" />
            <span>매물 = 호가(등록가)</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-text-1">
            <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-[#177a4a]" />
            <span>실거래 = 국토부 확정가</span>
          </div>
        </div>
        )}
        </div>
      )}

      {/* ===== 중앙 하단 플로팅 카테고리 바 (홈 인디케이터 위로 세이프에어리어 오프셋) =====
           `left-1/2 + -translate-x-1/2` 로 가운데를 잡으면 이 바가 쓸 수 있는 가로는
           화면의 절반뿐이다(shrink-to-fit 의 포함 블록이 left 기준 오른쪽 남은 폭).
           md 768폭에서 필요한 402px 를 384px 로 눌러 "동네이야기"가 줄바꿈했고,
           바 높이가 51 → 71px 로 늘어 아래 예약 레인(51px 기준)을 20px 뚫고 올라와
           좌우 범례 다섯 개를 11px 씩 덮었다(768폭 실측).
           inset-x-0 + mx-auto 로 바꾸면 가운데 정렬은 그대로면서 가로 전체를 쓴다. */}
      <nav
        ref={mapNavRef}
        className="glass-strong absolute inset-x-0 z-40 mx-auto flex w-fit max-w-[calc(100vw_-_24px)] items-center gap-0.5 rounded-full p-1.5"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-full px-4 py-[9px] text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary"
        >
          <HomeIcon />홈
        </Link>
        <Link
          href="/notes"
          className="rounded-full px-4 py-[9px] text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary"
        >
          임장노트
        </Link>
        {/* 현재 페이지 표시 — 옆의 <Link> 들과 생김새가 비슷해 눌러 보게 되므로
            aria-current 로 "여기가 지금 보고 있는 화면"임을 스크린리더에도 알린다. */}
        <span
          aria-current="page"
          className="rounded-full bg-[rgba(29,79,216,.12)] px-4 py-[9px] text-[13px] font-bold text-primary"
        >
          지도
        </span>
        <Link
          href="/analysis"
          className="hidden rounded-full px-4 py-[9px] text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary md:block"
        >
          AI 분석
        </Link>
        <Link
          href="/town"
          className="hidden rounded-full px-4 py-[9px] text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary md:block"
        >
          동네이야기
        </Link>
      </nav>

      {/* A1 — 첫 방문 코치마크. 한 번 보면 localStorage + app_users.onboarding_progress.tours 에 남는다. */}
      <CoachmarkTour tourId="map" steps={MAP_TOUR_STEPS} />
    </div>
  );
}
