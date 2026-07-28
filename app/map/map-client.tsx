"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "../components/Logo";
import { NaverMap, type MapIdleInfo, type MapMarkerData } from "@/components/map/NaverMap";
import {
  MapSearchBox,
  type MapSearchSelectAddress,
  type MapSearchSelectComplex,
} from "./MapSearchBox";
import { ComplexInfoPanel } from "./ComplexInfoPanel";
import { CompareTrayButton } from "@/app/complex/[id]/hub-client";
import { HistogramRangeSlider } from "./HistogramRangeSlider";
import { ListingPreviewPanel } from "./ListingPreviewPanel";
import {
  colorForType,
  labelForType,
  stageLabel,
  type RedevelopmentProject,
} from "@/lib/redevelopment/types";
import { Icon } from "@/app/components/Icon";
import { CoachmarkTour, type CoachmarkStep } from "@/app/components/CoachmarkTour";
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
    body: "면적·준공연도·세대수·통근시간으로 임장 후보를 걸러낼 수 있어요. 반경 그리기도 여기 있습니다.",
  },
  {
    target: "map-note-cta",
    title: "본 곳은 바로 임장노트로",
    body: "관심 단지를 찾았다면 노트를 남겨두세요. 다음 방문 때 체크리스트와 사진이 그대로 이어집니다.",
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
}

/* ===== 서버 클러스터링 (/api/map/clusters) ===== */

interface ClusterItem {
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
}

/** 이 네이버 줌 미만이면 서버 클러스터 마커를 표시 (API의 POINT_MODE_MIN_ZOOM과 동일) */
const CLUSTER_MODE_MAX_ZOOM = 14;
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
}: MapClientProps) {
  const router = useRouter();
  const focusedRegion = initialFocus?.name ?? null;
  const [zoom, setZoom] = useState<Zoom>(
    initialFocus || danji.length > 0 ? "danji" : "city",
  );
  const [level, setLevel] = useState<number>(
    initialFocus || danji.length > 0 ? LEVEL_BY_ZOOM.danji : LEVEL_BY_ZOOM.city,
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
       · ?region= 으로 지목된 지역이 있으면 그쪽이 우선이다 — 사용자가 명시한 목적지.
       · 한 번만 시도한다. 지도를 옮긴 뒤 다시 끌려가면 안 된다.
       · 국내 대략 범위 밖 좌표는 버린다. VPN·기기 오차로 태평양 한복판을 잡으면
         단지가 하나도 없는 빈 지도가 되어 "고장" 처럼 보인다.
     거부하거나 실패하면 조용히 기존 시작 위치를 쓴다. */
  const [geoApplied, setGeoApplied] = useState(false);
  const geoTriedRef = useRef(false);
  useEffect(() => {
    if (initialFocus) return;
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
  }, [initialFocus]);

  // 위치로 맞췄다는 안내는 잠깐만 — 지도 위에 계속 떠 있을 이유가 없다.
  useEffect(() => {
    if (!geoApplied) return;
    const t = setTimeout(() => setGeoApplied(false), 4_000);
    return () => clearTimeout(t);
  }, [geoApplied]);

  const selected = danji.find((d) => d.id === selectedId) ?? null;

  /* ===== 검색 선택 · 단지 정보 패널 (item1·item2) =====
     infoComplex: 목록 밖 단지(검색/포인트)용 정보 패널 대상.
     searchMarker: 목록 밖 단지를 지도에 하이라이트하기 위한 임시 마커. */
  const [infoComplex, setInfoComplex] = useState<{ id: string; name: string } | null>(null);
  const [searchMarker, setSearchMarker] = useState<
    { id: string; name: string; lat: number; lng: number } | null
  >(null);

  /* ===== 매물 레이어 상태 — 토글 ON일 때만 현재 뷰포트 매물을 마커로 ===== */
  const [showListings, setShowListings] = useState(false);
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
     (예: 단지 → 역, 단지 → 학교) */
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<{ lat: number; lng: number }[]>([]);
  const [listingItems, setListingItems] = useState<MapListingItem[]>([]);

  /* ===== 가격대·면적대·준공연도 필터 상태 (확대 · item3) =====
     세대수·유형은 실데이터 소스가 없어 필터에서 제외 — 패널에 "데이터 준비 중"으로 표시 */
  /** 거래유형(매물 레이어) — /api/map/listings?type= 로 서버 재조회 */
  const [listingTradeKey, setListingTradeKey] = useState("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  /* 상세 필터 — 뷰포트 분포(막대그래프)와 선택 범위 */
  const [facets, setFacets] = useState<MapFacets | null>(null);
  const [ranges, setRanges] = useState<RangeFilters>(EMPTY_RANGES);
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
  const [txType, setTxType] = useState<"trade" | "rent">("trade");
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
  const [redevItems, setRedevItems] = useState<RedevelopmentProject[]>([]);

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

  const filterActive = rangeActive || listingTradeKey !== "all" || commuteKey !== "off";
  const activeCount =
    [listingTradeKey, commuteKey].filter((k) => k !== "all" && k !== "off").length +
    (["price", "area", "year", "households"] as const).filter(
      (k) => ranges[k][0] !== null || ranges[k][1] !== null,
    ).length;

  const resetFilters = useCallback(() => {
    setRanges(EMPTY_RANGES);
    setListingTradeKey("all");
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
  const rangeFilteredDanji = useMemo(() => {
    if (!rangeActive) return danji;
    return danji.filter(
      (d) =>
        withinSel(d.avgPriceWon !== null ? d.avgPriceWon / 10_000 : null, ranges.price) &&
        withinSel(d.areaM2, ranges.area) &&
        withinSel(d.buildYear, ranges.year) &&
        withinSel(d.households, ranges.households),
    );
  }, [danji, rangeActive, ranges]);

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

  /* 반경 원의 실제 중심 — 찍은 지점이 있으면 그것, 없으면 지도 중심. */
  const radiusOrigin = radiusCenter ?? center;

  /* ===== 필터 패널 가로 위치 =====
     필터 패널은 좌측 상단에 고정돼 있었다. 그런데 같은 자리에 단지 정보(380px)·
     단지 상세(460px)·인기 단지(320px) 패널이 뜬다. 그래서 단지를 열어 둔 채
     "필터"를 누르면 두 카드가 포개져 글자가 서로 비쳐 보였다(소유자 지적).

     좌측 패널의 오른쪽 끝을 계산해 필터 패널을 그 옆으로 민다. 좁은 화면에서
     밀린 만큼 폭이 모자라지 않도록 max-width 도 같은 값으로 함께 줄인다. */
  const leftPanelEdgePx = selected ? 492 : infoComplex ? 412 : panelOpen ? 352 : 0;
  const filterLeftMdPx = Math.max(356, leftPanelEdgePx);
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
      return { ...p, label: i === 0 ? "시작" : formatDistanceM(acc) };
    });
  }, [measureMode, measurePoints]);

  /* 지도 클릭 — 거리 재기가 켜져 있으면 지점 추가, 반경 모드면 중심 이동.
     둘 다 꺼져 있으면 아무 일도 하지 않는다(기존 동작 유지). */
  const mapClickMode: "measure" | "radius" | null = measureMode
    ? "measure"
    : radiusMode
      ? "radius"
      : null;

  const handleMapClick = useCallback(
    (p: { lat: number; lng: number }) => {
      if (measureMode) {
        setMeasurePoints((prev) => [...prev, p]);
        return;
      }
      if (radiusMode) setRadiusCenter(p);
    },
    [measureMode, radiusMode],
  );

  // 컴팩트 칩 행: 매매/전세 토글 + 매물 토글 + "필터" 확장 버튼 (+활성 배지) + 초기화
  const filterBar = (
    <>
      {(
        [
          { key: "trade", label: "매매" },
          { key: "rent", label: "전세" },
        ] as const
      ).map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={txType === t.key}
          onClick={() => setTxType(t.key)}
          className={`chip whitespace-nowrap px-3 py-1.5 text-xs font-bold transition-colors ${
            txType === t.key
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
        onClick={() => setFiltersExpanded((v) => !v)}
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
            if (next) setMeasureMode(false);
            else setRadiusCenter(null);
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
            if (next) setRadiusMode(false);
            else setMeasurePoints([]);
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
    <div className="glass-strong flex max-h-[calc(100dvh-210px)] w-full flex-col gap-3 overflow-y-auto rounded-[18px] p-4 shadow-[0_16px_40px_rgba(16,28,54,.2)]">
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
      {/* 유형 — 국토부 아파트 실거래만 수집 중이라 아파트 단일 (선택할 것이 없음) */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-bold text-text-3">유형</div>
        {/* 예전엔 "아파트"가 선택된 필터 칩 모양(chip + bg-primary-soft)이었다.
            바로 아래 거래유형 칩들과 생김새가 같아서 눌러 바꿀 수 있는 것처럼
            보였지만 onClick 이 없는 <span> 이었다. 고를 것이 하나뿐이면 그건
            컨트롤이 아니라 설명이다 — 칩 껍데기를 벗겼다. */}
        <p className="text-[11px] leading-[1.5] text-text-2">
          지금 수집하는 국토부 실거래가 <b className="text-ink">아파트</b>뿐이라 아파트만
          표시됩니다. 오피스텔·연립다세대는 수집 준비가 끝났고, 화면에 유형 선택이 붙는 대로
          함께 보여드릴게요.
        </p>
      </div>
      <FilterChipGroup
        label={`거래유형 (매물 레이어${showListings ? "" : " · 켜면 적용"})`}
        options={LISTING_TRADE_OPTIONS}
        valueKey={listingTradeKey}
        onSelect={setListingTradeKey}
      />

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
      fetch(`/api/map/listings?${params.toString()}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<{ items: MapListingItem[] }>) : null))
        .then((json) => {
          if (!json || controller.signal.aborted) return;
          setListingItems(Array.isArray(json.items) ? json.items : []);
        })
        .catch(() => undefined); // 실패 시 기존 마커 유지
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
    }
  }, [showListings, fetchListings]);

  // 거래유형(매매/전세/월세) 변경 → 매물 레이어가 켜져 있으면 서버 재조회
  useEffect(() => {
    if (showListings && lastBoundsRef.current) fetchListings(lastBoundsRef.current);
  }, [listingTradeKey, showListings, fetchListings]);

  /** 클러스터/포인트 조회 예약 — 디바운스 후 현재 거래유형(매매/전세)으로 요청 */
  const scheduleClusterFetch = useCallback(
    (bounds: NonNullable<MapIdleInfo["bounds"]>, mapZoom: number) => {
      if (fetchTimerRef.current !== null) window.clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = window.setTimeout(() => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const params = new URLSearchParams({
          minLat: String(bounds.swLat),
          maxLat: String(bounds.neLat),
          minLng: String(bounds.swLng),
          maxLng: String(bounds.neLng),
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
            setPopular(Array.isArray(j.items) ? j.items : []);
            setPopularScope(j.scope === "viewport" ? "viewport" : "nationwide");
            setPopularFailed(false);
            setPopularLoading(false);
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

  /* ===== 정비사업 레이어 — 토글 ON 시 1회 로드(전국 소량 · bbox 불필요) ===== */
  useEffect(() => {
    if (!showRedevelopment || redevItems.length > 0) return;
    const controller = new AbortController();
    fetch("/api/redevelopment/projects?limit=3000", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((json: { items?: RedevelopmentProject[] }) => {
        setRedevItems(Array.isArray(json.items) ? json.items : []);
      })
      .catch(() => {
        /* abort/네트워크 오류 무시 */
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
          id: `cluster:${c.lat}:${c.lng}`,
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
    center.lat,
    center.lng,
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
    setInfoComplex(null);
    setSearchMarker(null);
    setSelectedId(id);
    setDetailTab("요약");
    const d = danji.find((x) => x.id === id);
    if (d) setCenter({ lat: d.lat, lng: d.lng });
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

  const goToMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  };

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
  useEffect(() => {
    if (detailTab !== "노트" || !selectedName) {
      setComplexNotes([]);
      setComplexNotesStatus("idle");
      return;
    }
    const controller = new AbortController();
    setComplexNotesStatus("loading");
    fetch(`/api/map/complex-notes?name=${encodeURIComponent(selectedName)}`, {
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
  }, [detailTab, selectedName]);

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

  return (
    // fixed inset-0 + 100dvh: 문서 흐름에서 분리해 지도 아래 빈 공간(높이 계산 오차)을 제거.
    // dvh 미지원 브라우저는 inset-0(bottom:0)이 폴백으로 풀스크린 유지.
    <div className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef]">
      {/* ===== 실제 네이버 지도 (실패 시 그라데이션 폴백) ===== */}
      <NaverMap
        markers={markers}
        center={center}
        level={level}
        rounded={false}
        showControls={false}
        className="absolute inset-0 z-0"
        onMarkerClick={handleMarkerClick}
        onIdle={handleMapIdle}
        fallback={gradientFallback}
        circle={
          radiusMode ? { lat: radiusOrigin.lat, lng: radiusOrigin.lng, radiusM } : null
        }
        onMapClick={mapClickMode ? handleMapClick : undefined}
        measurePath={measurePath}
        crosshair={mapClickMode !== null}
      />

      {/* ===== item5 — 빈 뷰포트/조회 실패 안내. 실패와 빈 결과를 구분한다 ===== */}
      {(viewportEmpty || clusterFetchStatus === "error") && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 z-20 w-max max-w-[calc(100vw-48px)] -translate-x-1/2 rounded-full bg-[rgba(16,28,54,.72)] px-4 py-2 text-center text-[12px] font-semibold text-white shadow-[0_6px_18px_rgba(16,28,54,.25)]"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 96px)" }}
        >
          {clusterFetchStatus === "error"
            ? "일시적 오류로 단지 정보를 불러오지 못했어요 — 잠시 후 다시 시도해 주세요"
            : "이 지역 단지 좌표를 준비 중이에요 — 곳곳에서 순차 확충 중"}
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
        <Link
          href="/notes/new"
          data-tour="map-note-cta"
          className="btn-primary btn-cta shrink-0 rounded-xl px-4 py-[9px] text-[13px]"
        >
          이 지역 노트 쓰기
        </Link>
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
           모바일은 검색바 아래(+140), md 이상은 헤더 우측 여백(+88). inline style는
           반응형 top 클래스를 덮어쓰므로 top은 클래스로만 지정한다. */}
      {!selected && (
        <div className="absolute left-4 top-[calc(env(safe-area-inset-top,0px)+140px)] z-30 flex items-center gap-1.5 md:left-[356px] md:top-[calc(env(safe-area-inset-top,0px)+88px)] lg:hidden">
          {filterBar}
        </div>
      )}

      {/* ===== 상세 필터 확장 패널 (item3) — 접이식·모바일 친화 ===== */}
      {filtersExpanded && (
        <div
          className="absolute left-4 z-[41] w-[300px] max-w-[calc(100vw_-_32px)] md:left-[var(--nz-filter-left)] md:max-w-[calc(100vw_-_var(--nz-filter-left)_-_16px)] lg:left-[var(--nz-filter-left-lg)] lg:max-w-[calc(100vw_-_var(--nz-filter-left-lg)_-_16px)]"
          style={
            {
              top: "calc(env(safe-area-inset-top, 0px) + 184px)",
              "--nz-filter-left": `${filterLeftMdPx}px`,
              "--nz-filter-left-lg": `${filterLeftLgPx}px`,
            } as CSSProperties
          }
        >
          {filterPanel}
        </div>
      )}

      {/* 현재 위치로 맞췄음을 알리는 짧은 안내 */}
      {geoApplied && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 z-20 w-max max-w-[calc(100vw-48px)] -translate-x-1/2 rounded-full bg-[rgba(16,28,54,.72)] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_6px_18px_rgba(16,28,54,.25)]"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 96px)" }}
        >
          현재 위치 기준으로 지도를 맞췄어요
        </div>
      )}

      {/* ===== 반경 · 거리 재기 안내/결과 =====
           클릭이 평소와 다른 뜻을 갖는 모드라, 무엇을 누르면 되는지와 잰 결과를
           같은 자리에서 보여 준다. 좌측 패널과 겹치지 않게 우측에 세운다. */}
      {mapClickMode && (
        <div
          className="glass-strong absolute right-5 z-[42] flex w-[228px] flex-col gap-2 rounded-[16px] px-3.5 py-3 shadow-[0_12px_32px_rgba(16,28,54,.18)]"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 212px)" }}
        >
          {mapClickMode === "radius" ? (
            <>
              <div className="text-[12px] font-extrabold text-ink">반경 보기</div>
              <p className="text-[11px] leading-[1.6] text-text-3">
                {radiusCenter
                  ? "지도를 다시 클릭하면 중심이 옮겨집니다."
                  : "지도를 클릭해 중심을 찍어 보세요. 아직 안 찍었으면 화면 중앙이 기준입니다."}
              </p>
              <div className="rounded-[10px] bg-[rgba(29,79,216,.07)] px-2.5 py-2 text-[11px] font-bold text-primary">
                반경 {radiusM >= 1000 ? `${radiusM / 1000}km` : `${radiusM}m`} 안의 단지만 표시
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-extrabold text-ink">거리 재기</span>
                <span className="text-[10px] text-text-3">{measurePoints.length}개 지점</span>
              </div>
              {measurePoints.length < 2 ? (
                <p className="text-[11px] leading-[1.6] text-text-3">
                  지도에서 두 지점을 차례로 클릭하면 직선거리를 보여 드려요.
                </p>
              ) : (
                <>
                  <div className="rounded-[10px] bg-[rgba(29,79,216,.07)] px-2.5 py-2">
                    <div className="text-[10px] text-text-3">처음 ↔ 마지막 직선거리</div>
                    <div className="text-[15px] font-extrabold text-primary">
                      {formatDistanceM(measureStraightM)}
                    </div>
                  </div>
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
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMeasurePoints((p) => p.slice(0, -1))}
                  disabled={measurePoints.length === 0}
                  className="flex-1 rounded-[9px] border border-line px-2 py-1.5 text-[11px] font-bold text-text-2 disabled:opacity-40"
                >
                  되돌리기
                </button>
                <button
                  type="button"
                  onClick={() => setMeasurePoints([])}
                  disabled={measurePoints.length === 0}
                  className="flex-1 rounded-[9px] border border-line px-2 py-1.5 text-[11px] font-bold text-text-2 disabled:opacity-40"
                >
                  전체 지우기
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setRadiusMode(false);
              setRadiusCenter(null);
              setMeasureMode(false);
              setMeasurePoints([]);
            }}
            className="rounded-[9px] bg-[rgba(16,28,54,.06)] px-2 py-1.5 text-[11px] font-bold text-text-2"
          >
            끝내기
          </button>
        </div>
      )}

      {/* ===== 줌 레벨 탭 ===== */}
      <div
        className="glass absolute right-5 z-30 mt-9 flex items-center gap-0.5 rounded-full p-1 md:mt-0 md:translate-y-9"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 92px)" }}
      >
        {ZOOM_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setZoom(t.key);
              setLevel(LEVEL_BY_ZOOM[t.key]);
              setSelectedId(null);
              setInfoComplex(null);
              setSearchMarker(null);
            }}
            className={`chip px-3 py-1.5 text-xs transition-colors ${
              zoom === t.key ? "bg-[rgba(29,79,216,.12)] font-bold text-primary" : "text-text-1"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="absolute right-5 top-[92px] z-30 hidden translate-y-[76px] rounded-lg bg-[rgba(255,255,255,.8)] px-2.5 py-[5px] text-[11px] text-text-3 md:block">
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
          className="glass-strong absolute bottom-5 left-5 z-30 hidden w-[320px] flex-col overflow-hidden rounded-[20px] md:flex"
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
      {!selected && (
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

      {/* ===== 단지 클릭 → 상세 패널 (9q, 460px) ===== */}
      {selected && (
        <aside
          className="glass-strong rise-in absolute left-4 right-4 z-30 flex flex-col overflow-hidden rounded-[22px] md:left-5 md:right-auto md:w-[460px]"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 92px)",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          }}
        >
          <div className="flex items-start justify-between border-b border-[rgba(16,28,54,.06)] px-[22px] pb-3.5 pt-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[19px] font-extrabold text-ink">{selected.name}</span>
                {selected.note && (
                  <span className="rounded-[5px] bg-primary-soft px-2 py-0.5 text-[10px] font-extrabold text-primary">
                    내 {selected.note}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-text-2">{selected.meta}</div>
              <Link
                href={`/complex/${encodeURIComponent(selected.id)}`}
                className="mt-1.5 inline-block text-xs font-extrabold text-primary"
              >
                단지 홈 ›
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="패널 닫기"
              className="text-[15px] text-text-3"
            >
              ✕
            </button>
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

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-[22px] py-4">
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
                            <span className="mr-1.5 rounded-[4px] bg-primary-soft px-1.5 py-[1px] text-[10px] font-extrabold text-primary">
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
                    아직 이 단지의 임장노트가 없어요 — 첫 노트를 남겨보세요
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
        </aside>
      )}

      {/* ===== 단지 정보 패널 (item2) — 검색/포인트 선택 시 실데이터 하단 시트 ===== */}
      {infoComplex && (
        <ComplexInfoPanel
          complexId={infoComplex.id}
          initialName={infoComplex.name}
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

      {/* ===== 매물 등록 플로팅 버튼 (우하단, 줌 컨트롤 위 · 탭바 위) ===== */}
      <Link
        href="/listings/new"
        aria-label="매물 등록"
        className="btn-primary btn-cta absolute right-5 z-30 flex items-center gap-1.5 rounded-full px-4 py-3 text-[13px] font-extrabold text-white shadow-[0_10px_28px_rgba(29,79,216,.42)]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 214px)" }}
      >
        <span className="text-base leading-none">＋</span>
        매물 등록
      </Link>

      {/* ===== 우하단 줌 컨트롤 ===== */}
      <div
        className="absolute right-5 z-30 flex flex-col gap-1.5"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}
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
        <button
          type="button"
          aria-label="현재 위치"
          onClick={goToMyLocation}
          className="glass flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-[13px] text-primary"
        >
          ◎
        </button>
      </div>

      {/* ===== 범례 (md+) ===== */}
      <div className="glass absolute bottom-5 right-5 z-30 hidden gap-3.5 rounded-xl px-3.5 py-[9px] md:flex">
        <div className="flex items-center gap-1.5 text-[11px] text-text-1">
          <span className="h-[9px] w-[9px] rounded-[3px] bg-primary" />
          임장한 단지
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-text-1">
          <span className="h-[9px] w-[9px] rounded-[3px] border border-[#c3cad6] bg-surface" />
          미방문
        </div>
      </div>

      {/* ===== item7 — 모바일 접이식 범례 (기본 접힘). md 전용이던 범례·줌 캡션을 노출 ===== */}
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

      {/* ===== 정비사업 종류 범례 (#20) — 레이어 ON & 화면 내 사업종류만, 기본 범례 위에 스택 ===== */}
      {showRedevelopment && redevLegend.length > 0 && (
        <div
          className="glass absolute right-5 z-30 hidden max-h-[42vh] w-[184px] flex-col gap-1.5 overflow-y-auto rounded-xl px-3 py-2.5 md:flex"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}
        >
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

      {/* C8 가격 표기 범례 — 매물(호가) vs 실거래(국토부 확정가) 구분 명시 (매물 레이어 ON) */}
      {showListings && (
        <div
          className="glass absolute left-5 z-30 hidden w-[196px] flex-col gap-1 rounded-xl px-3 py-2.5 md:flex"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}
        >
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

      {/* C1 시세 색상 범례 — 색이 무엇을 뜻하고 어디서 왔는지를 화면에서 바로 읽게 한다.
          매물 안내 범례가 켜져 있으면 그 위로 쌓는다. */}
      {showPriceOverlay && (
        <div
          className="glass absolute left-5 z-30 hidden w-[216px] flex-col gap-1.5 rounded-xl px-3 py-2.5 md:flex"
          style={{
            bottom: showListings
              ? "calc(env(safe-area-inset-bottom, 0px) + 142px)"
              : "calc(env(safe-area-inset-bottom, 0px) + 60px)",
          }}
        >
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

      {/* ===== 중앙 하단 플로팅 카테고리 바 (홈 인디케이터 위로 세이프에어리어 오프셋) ===== */}
      <nav
        className="glass-strong absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1.5"
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
