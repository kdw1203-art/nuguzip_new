"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface RangeOption {
  key: string;
  label: string;
  /** 이상 (포함) */
  min?: number;
  /** 이하 (포함) */
  max?: number;
}

/** 가격대 — 억 단위 (avgPriceWon / 1e8) */
const PRICE_OPTIONS: RangeOption[] = [
  { key: "all", label: "전체" },
  { key: "u5", label: "5억 이하", max: 5 },
  { key: "5-10", label: "5~10억", min: 5, max: 10 },
  { key: "10-15", label: "10~15억", min: 10, max: 15 },
  { key: "o15", label: "15억 초과", min: 15 },
];

/** 면적대 — 전용면적 ㎡ (59·84 국민평형 기준 구간) */
const AREA_OPTIONS: RangeOption[] = [
  { key: "all", label: "전체" },
  { key: "u60", label: "~59㎡", max: 60 },
  { key: "60-85", label: "60~84㎡", min: 60, max: 85 },
  { key: "85-135", label: "85~134㎡", min: 85, max: 135 },
  { key: "o135", label: "135㎡~", min: 135 },
];

/** 준공연도 */
const YEAR_OPTIONS: RangeOption[] = [
  { key: "all", label: "전체" },
  { key: "2020s", label: "2020년 이후", min: 2020 },
  { key: "2010s", label: "2010년대", min: 2010, max: 2019 },
  { key: "2000s", label: "2000년대", min: 2000, max: 2009 },
  { key: "u2000", label: "2000년 이전", max: 1999 },
];

/* 세대수 필터는 실데이터 소스가 아직 없다(실거래엔 세대수가 없고, 대장 마스터
   householdCount 는 품질 문제로 미사용). 예전엔 칩을 눌러도 전 단지가 제외돼
   항상 0건이 되는 "동작하는 척"이었다 — 지금은 "데이터 준비 중" 비활성으로
   정직하게 보여주고 필터 적용에서 뺀다. 유형도 국토부 아파트 실거래만 수집하므로
   아파트 단일로 표시한다. */

/** 거래유형(매물 레이어) — 매매/전세/월세 → /api/map/listings?type= */
const LISTING_TRADE_OPTIONS: { key: string; label: string; type?: string }[] = [
  { key: "all", label: "전체" },
  { key: "sale", label: "매매", type: "sale" },
  { key: "jeonse", label: "전세", type: "jeonse" },
  { key: "monthly", label: "월세", type: "monthly" },
];

/** 범위 판정 — 필터가 걸려 있는데 값이 없으면 제외 (불확실한 항목을 결과에 섞지 않음) */
function inRange(value: number | null, opt: RangeOption): boolean {
  if (opt.min === undefined && opt.max === undefined) return true;
  if (value === null || !Number.isFinite(value)) return false;
  if (opt.min !== undefined && value < opt.min) return false;
  if (opt.max !== undefined && value > opt.max) return false;
  return true;
}

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
}

/** item9 — 노트 탭에 싣는 그 단지 임장노트 (GET /api/map/complex-notes) */
interface ComplexNoteItem {
  id: string;
  title: string;
  visitDate: string | null;
  region: string | null;
  mine: boolean;
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
const JEONSE_MARKER_COLOR = "#1a7f4e";
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
const RADIUS_PRESETS = [500, 1000, 2000] as const;

export function MapClient({ danji, regionLabel, regionMarkers }: MapClientProps) {
  const router = useRouter();
  const [zoom, setZoom] = useState<Zoom>(danji.length > 0 ? "danji" : "city");
  const [level, setLevel] = useState<number>(
    danji.length > 0 ? LEVEL_BY_ZOOM.danji : LEVEL_BY_ZOOM.city,
  );
  const [panelOpen, setPanelOpen] = useState(true);
  /* 모바일 지도↔목록 전환 — 데스크탑은 좌측 목록 패널이 항상 있지만 모바일은
     지도뿐이었다. 저사양 기기·지도 로드 실패 시 대안이 없고, 목록으로 훑고
     싶은 사용자도 있다. "list"면 지도 위에 전체 화면 목록을 덮는다. */
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("요약");
  const [center, setCenter] = useState(() => {
    if (danji.length > 0) {
      const lat = danji.reduce((s, d) => s + d.lat, 0) / danji.length;
      const lng = danji.reduce((s, d) => s + d.lng, 0) / danji.length;
      return { lat, lng };
    }
    // 단지 좌표가 없으면 지역 시세 마커 중심(수도권) — 서울 시청 근방
    return { lat: 37.5665, lng: 126.978 };
  });

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
  // C3 반경 그리기 필터 — 중심(지도 중심) 기준 반경 내 단지만 표시
  const [radiusMode, setRadiusMode] = useState(false);
  const [radiusM, setRadiusM] = useState<number>(1000);
  const [listingItems, setListingItems] = useState<MapListingItem[]>([]);

  /* ===== 가격대·면적대·준공연도 필터 상태 (확대 · item3) =====
     세대수·유형은 실데이터 소스가 없어 필터에서 제외 — 패널에 "데이터 준비 중"으로 표시 */
  const [priceKey, setPriceKey] = useState("all");
  const [areaKey, setAreaKey] = useState("all");
  const [yearKey, setYearKey] = useState("all");
  /** 거래유형(매물 레이어) — /api/map/listings?type= 로 서버 재조회 */
  const [listingTradeKey, setListingTradeKey] = useState("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
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

  const danjiFilterActive =
    priceKey !== "all" || areaKey !== "all" || yearKey !== "all";
  const filterActive =
    danjiFilterActive || listingTradeKey !== "all" || commuteKey !== "off";
  const activeCount = [priceKey, areaKey, yearKey, listingTradeKey, commuteKey].filter(
    (k) => k !== "all" && k !== "off",
  ).length;

  const resetFilters = useCallback(() => {
    setPriceKey("all");
    setAreaKey("all");
    setYearKey("all");
    setListingTradeKey("all");
    setCommuteKey("off");
  }, []);

  // 범위 필터만 적용한 단지 (출퇴근 추정 요청·비교의 기준 집합)
  const rangeFilteredDanji = useMemo(() => {
    if (!danjiFilterActive) return danji;
    const priceOpt = PRICE_OPTIONS.find((o) => o.key === priceKey) ?? PRICE_OPTIONS[0];
    const areaOpt = AREA_OPTIONS.find((o) => o.key === areaKey) ?? AREA_OPTIONS[0];
    const yearOpt = YEAR_OPTIONS.find((o) => o.key === yearKey) ?? YEAR_OPTIONS[0];
    return danji.filter(
      (d) =>
        inRange(d.avgPriceWon !== null ? d.avgPriceWon / 100_000_000 : null, priceOpt) &&
        inRange(d.areaM2, areaOpt) &&
        inRange(d.buildYear, yearOpt),
    );
  }, [danji, danjiFilterActive, priceKey, areaKey, yearKey]);

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
        onClick={() => setRadiusMode((v) => !v)}
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
    </>
  );

  // 확장 패널: 모든 범위/유형 필터 (칩 그룹) — 모바일 친화 접이식
  const filterPanel = filtersExpanded ? (
    <div className="glass-strong flex max-h-[calc(100dvh-210px)] w-[300px] max-w-[calc(100vw-32px)] flex-col gap-3 overflow-y-auto rounded-[18px] p-4 shadow-[0_16px_40px_rgba(16,28,54,.2)]">
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
      <FilterChipGroup label="가격대(매매)" options={PRICE_OPTIONS} valueKey={priceKey} onSelect={setPriceKey} />
      <FilterChipGroup label="평형대(전용면적)" options={AREA_OPTIONS} valueKey={areaKey} onSelect={setAreaKey} />
      <FilterChipGroup label="준공연도" options={YEAR_OPTIONS} valueKey={yearKey} onSelect={setYearKey} />
      {/* 세대수 — 실데이터 소스 미연동. 동작하지 않는 칩을 살려두는 대신 정직하게 비활성 */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-bold text-text-3">
          세대수 규모 <span className="font-normal">· 데이터 준비 중</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span
            aria-disabled="true"
            className="chip cursor-not-allowed whitespace-nowrap bg-[rgba(255,255,255,.55)] px-2.5 py-1.5 text-xs text-[#c3cad6]"
          >
            데이터 연동 후 제공돼요
          </span>
        </div>
      </div>
      {/* 유형 — 국토부 아파트 실거래만 수집 중이라 아파트 단일 (선택할 것이 없음) */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-bold text-text-3">유형</div>
        <div className="flex flex-wrap gap-1.5">
          <span className="chip whitespace-nowrap bg-primary-soft px-2.5 py-1.5 text-xs font-bold text-primary">
            아파트
          </span>
          <span className="self-center text-[10px] text-text-3">
            오피스텔·빌라는 준비 중
          </span>
        </div>
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

  const handleMapIdle = useCallback(
    (info: MapIdleInfo) => {
      const bounds = info.bounds;
      if (!bounds) return;
      lastBoundsRef.current = bounds;
      lastIdleRef.current = { bounds, zoom: info.zoom };
      setViewBounds(bounds);
      if (showListingsRef.current) fetchListings(bounds);
      scheduleClusterFetch(bounds, info.zoom);
    },
    [fetchListings, scheduleClusterFetch],
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
    // API 추가 포인트에는 가격·면적·연식 정보가 없어 (매매)필터 적용 시 제외.
    // 전세 모드는 매매 기준 필터와 무관하므로 항상 표시.
    if (!danjiFilterActive || txType === "rent") {
      const known = new Set(base.map((m) => m.id));
      for (const p of extraPoints) {
        if (known.has(p.id)) continue;
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
    // C3 반경 필터 — 반경 모드일 때 중심에서 radiusM 내 단지 마커만 표시
    const shownBase = radiusMode
      ? base.filter((m) => haversineM(center.lat, center.lng, m.lat, m.lng) <= radiusM)
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
    danjiFilterActive,
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
        circle={radiusMode ? { lat: center.lat, lng: center.lng, radiusM } : null}
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
          className="absolute left-4 z-[41] md:left-[356px] lg:left-[200px]"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 184px)" }}
        >
          {filterPanel}
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

      {/* ===== 좌측 사이드 패널 (320px, 접기 핸들) ===== */}
      {!selected && panelOpen && (
        <aside
          data-tour="map-price-panel"
          className="glass-strong absolute bottom-5 left-5 z-30 hidden w-[320px] flex-col overflow-hidden rounded-[20px] md:flex"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 92px)" }}
        >
          <div className="flex items-baseline justify-between px-5 pb-2.5 pt-4">
            <div className="text-[15px] font-extrabold text-ink">
              {regionLabel} 단지 {filteredDanji.length}
              {(danjiFilterActive || commuteActive) && (
                <span className="ml-1 text-[11px] font-bold text-primary">필터 적용</span>
              )}
            </div>
            <div className="text-xs text-text-3">시세순 ▾</div>
          </div>
          {txType === "rent" && (
            <div className="px-5 pb-1.5 text-[10px] text-text-3">
              목록 가격은 매매 실거래 평균이에요 — 전세 보증금은 지도 마커에서 확인
            </div>
          )}
          {(danjiFilterActive || commuteActive) && filteredDanji.length === 0 && (
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
            {filteredDanji.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onClick={() => selectDanji(d.id)}
                className={`rise-in-${Math.min(i + 1, 6)} card-hover flex flex-col gap-1.5 rounded-[14px] bg-surface px-4 py-3.5 text-left ${
                  d.id === selectedId ? "border-[1.5px] border-primary" : "border border-line"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-bold text-ink">{d.name}</div>
                  {d.note ? (
                    <span className="rounded-[5px] bg-primary-soft px-2 py-[3px] text-[11px] font-bold text-primary">
                      {d.note}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#c3cad6]">노트 없음</span>
                  )}
                </div>
                <div className="text-xs text-text-3">{d.meta}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[17px] font-extrabold text-ink">{d.price}</span>
                  <span className={`text-xs ${deltaClass(d.deltaTone)}`}>{d.delta}</span>
                  <span className="text-xs text-text-3">{d.size}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="p-3.5">
            <Link
              href="/notes/compare"
              className="btn-soft block rounded-xl p-3 text-center text-[13px]"
            >
              선택 단지 비교
            </Link>
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
              {regionLabel} 단지 {filteredDanji.length}
              {(danjiFilterActive || commuteActive) && (
                <span className="ml-1 text-[11px] font-bold text-primary">필터 적용</span>
              )}
            </div>
            <span className="text-[11px] text-text-3">국토부 실거래 평균</span>
          </div>
          {filteredDanji.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <div className="text-xs text-text-2">
                {danjiFilterActive || commuteActive
                  ? "조건에 맞는 단지가 없어요."
                  : "이 지역 단지 목록을 준비 중이에요."}
              </div>
              {(danjiFilterActive || commuteActive) && (
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
                  <Link
                    href="/notes/compare"
                    className="btn-secondary flex-1 rounded-xl p-[11px] text-center text-xs"
                  >
                    비교에 담기
                  </Link>
                </div>
              </>
            )}

            {detailTab === "매물" && (
              <div className="flex flex-col gap-3">
                {/* 사실 우선: 단지별 실매물 피드 미연동 — 허위 매물 목록 대신 지도 매물 레이어로 안내 */}
                <div className="card rounded-[14px] px-[15px] py-6 text-center">
                  <div className="text-[13px] font-bold text-ink">
                    이 단지의 실매물은 준비 중이에요
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-text-3">
                    지도 상단의 “매물” 레이어를 켜면 주변에 등록된 실매물을 지도에서 볼 수 있어요.
                  </div>
                </div>
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
            <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-[#1a7f4e]" />
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
        <span className="rounded-full bg-[rgba(29,79,216,.12)] px-4 py-[9px] text-[13px] font-bold text-primary">
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
