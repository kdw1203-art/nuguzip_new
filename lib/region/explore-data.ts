// ─── 지역 탐색용 데모 데이터 ──────────────────────────────────
// Figma Make 소스에서 발췌·재정의. 서울 25구 + 주요 권역 좌표는 seoul-districts 와 공유합니다.

import {
  METRO_EXPLORE_DISTRICTS,
  SEOUL_DISTRICTS,
  type SeoulDistrictInfo,
} from "@/lib/map/seoul-districts";
import { normalizeRegionKey } from "@/lib/region/catalog";
import { buildPropertyActions } from "@/lib/navigation/property-actions";
import type { DevelopmentLevel } from "@/lib/region/development-status";

export type DemoRegion = {
  id: string;
  city: string;
  district: string;
  avgPrice: number;
  priceChange: number;
  priceChangeMonth: number;
  /** 실데이터(KB·한국부동산원) 전세가율(%) — 있으면 시세 합성 시 우선 사용 */
  jeonseRatioPct?: number;
  tradingVolume: number;
  newListings: number;
  inspections: number;
  popularComplex: string;
  popularComplexPrice: number;
  topKeywords: string[];
  recentTrade: { complex: string; area: number; price: number; date: string };
  schoolRank: string;
  safetyGrade: string;
  transportScore: number;
  insightCount: number;
  communityPosts: number;
  lat: number;
  lng: number;
};

const DETAILED_REGIONS: DemoRegion[] = [
  {
    id: "gangnam-gu",
    city: "서울",
    district: "강남구",
    avgPrice: 2_850_000_000,
    priceChange: 2.3,
    priceChangeMonth: 0.8,
    tradingVolume: 142,
    newListings: 38,
    inspections: 89,
    popularComplex: "은마아파트",
    popularComplexPrice: 2_100_000_000,
    topKeywords: ["재건축", "학군", "교통"],
    recentTrade: { complex: "대치 래미안", area: 84, price: 3_200_000_000, date: "2026-03-10" },
    schoolRank: "최상위",
    safetyGrade: "A",
    transportScore: 98,
    insightCount: 234,
    communityPosts: 156,
    lat: 37.4979,
    lng: 127.0276,
  },
  {
    id: "mapo-gu",
    city: "서울",
    district: "마포구",
    avgPrice: 1_250_000_000,
    priceChange: 4.1,
    priceChangeMonth: 1.2,
    tradingVolume: 98,
    newListings: 52,
    inspections: 61,
    popularComplex: "마포래미안푸르지오",
    popularComplexPrice: 1_580_000_000,
    topKeywords: ["직주근접", "신축", "홍대인근"],
    recentTrade: { complex: "공덕 파크자이", area: 59, price: 1_150_000_000, date: "2026-03-14" },
    schoolRank: "상위",
    safetyGrade: "A",
    transportScore: 92,
    insightCount: 178,
    communityPosts: 89,
    lat: 37.5665,
    lng: 126.9014,
  },
  {
    id: "seongnam-bundang",
    city: "경기",
    district: "성남시 분당구",
    avgPrice: 1_450_000_000,
    priceChange: 5.8,
    priceChangeMonth: 2.1,
    tradingVolume: 67,
    newListings: 29,
    inspections: 44,
    popularComplex: "파크뷰",
    popularComplexPrice: 1_700_000_000,
    topKeywords: ["판교IT", "학군", "자연환경"],
    recentTrade: { complex: "수내동 삼성", area: 112, price: 1_950_000_000, date: "2026-03-08" },
    schoolRank: "상위",
    safetyGrade: "A+",
    transportScore: 85,
    insightCount: 145,
    communityPosts: 73,
    lat: 37.3825,
    lng: 127.1235,
  },
  {
    id: "songpa-gu",
    city: "서울",
    district: "송파구",
    avgPrice: 2_100_000_000,
    priceChange: 1.7,
    priceChangeMonth: 0.5,
    tradingVolume: 118,
    newListings: 41,
    inspections: 72,
    popularComplex: "잠실엘스",
    popularComplexPrice: 2_450_000_000,
    topKeywords: ["잠실", "올림픽공원", "강남생활권"],
    recentTrade: { complex: "리센츠", area: 84, price: 2_280_000_000, date: "2026-03-12" },
    schoolRank: "최상위",
    safetyGrade: "A",
    transportScore: 95,
    insightCount: 198,
    communityPosts: 112,
    lat: 37.5145,
    lng: 127.1059,
  },
];

const DETAILED_BY_DISTRICT = new Map(
  DETAILED_REGIONS.map((r) => [normalizeDistrictKey(r.district), r]),
);

/** @deprecated catalog 의 normalizeRegionKey 로 통합됨. 호환용 alias. */
function normalizeDistrictKey(name: string): string {
  return normalizeRegionKey(name);
}

function cityForDistrict(info: SeoulDistrictInfo): string {
  if (info.city) return info.city;
  if (info.id === "seongnam-bundang") return "경기";
  if (info.id === "incheon-yeonsu") return "인천";
  return "서울";
}

function synthesizeRegion(info: SeoulDistrictInfo): DemoRegion {
  const perM2 = info.avgPricePerM2 ?? 10_000_000;
  const avgPrice = Math.round(perM2 * 84);
  const mom = info.momPct ?? 0;
  const trades = info.tradeCount30d ?? 40;
  const district = info.name;

  return {
    id: info.id,
    city: cityForDistrict(info),
    district,
    avgPrice,
    priceChange: mom,
    priceChangeMonth: Number((mom / 2).toFixed(1)),
    tradingVolume: trades,
    newListings: Math.max(8, Math.round(trades * 0.35)),
    inspections: Math.max(10, Math.round(trades * 0.6)),
    popularComplex: `${district.replace(/구$/, "")} 대표 단지`,
    popularComplexPrice: Math.round(avgPrice * 1.08),
    topKeywords: ["교통", "학군", "생활편의"],
    recentTrade: {
      complex: `${district} 아파트`,
      area: 84,
      price: avgPrice,
      date: "2026-03-15",
    },
    schoolRank: perM2 >= 18_000_000 ? "상위" : perM2 >= 12_000_000 ? "중상" : "보통",
    safetyGrade: perM2 >= 15_000_000 ? "A" : "B+",
    transportScore: Math.min(98, 70 + Math.round(trades / 5)),
    insightCount: Math.round(trades * 1.4),
    communityPosts: Math.round(trades * 0.9),
    lat: info.lat,
    lng: info.lng,
  };
}

function regionFromDistrictInfo(info: SeoulDistrictInfo): DemoRegion {
  const detailed = DETAILED_BY_DISTRICT.get(normalizeDistrictKey(info.name));
  if (detailed) {
    return {
      ...detailed,
      lat: info.lat,
      lng: info.lng,
      id: info.id,
    };
  }
  return synthesizeRegion(info);
}

/** 지역 탐색·지도 마커 공용 목록 (서울 25구 + 분당·연수) */
export const EXPLORE_REGIONS: DemoRegion[] = [
  ...SEOUL_DISTRICTS.map(regionFromDistrictInfo),
  ...METRO_EXPLORE_DISTRICTS.map(regionFromDistrictInfo),
];

/** @deprecated EXPLORE_REGIONS 와 동일 */
export const DEMO_REGIONS = EXPLORE_REGIONS;

export function findExploreRegionByDistrict(query: string): DemoRegion | undefined {
  const key = normalizeDistrictKey(query.trim());
  if (!key) return undefined;
  return EXPLORE_REGIONS.find((r) => {
    const districtKey = normalizeDistrictKey(r.district);
    return districtKey === key || districtKey.includes(key) || key.includes(districtKey);
  });
}

export const PRICE_TREND_DATA = [
  { month: "10월", gangnam: 2680, mapo: 1190, bundang: 1350, songpa: 2050 },
  { month: "11월", gangnam: 2710, mapo: 1200, bundang: 1380, songpa: 2070 },
  { month: "12월", gangnam: 2740, mapo: 1215, bundang: 1390, songpa: 2080 },
  { month: "1월", gangnam: 2780, mapo: 1230, bundang: 1410, songpa: 2090 },
  { month: "2월", gangnam: 2820, mapo: 1240, bundang: 1440, songpa: 2095 },
  { month: "3월", gangnam: 2850, mapo: 1250, bundang: 1450, songpa: 2100 },
];

export type PriceTrendPoint = (typeof PRICE_TREND_DATA)[number];

export function formatPrice(price: number): string {
  if (price >= 100_000_000) {
    const eok = Math.floor(price / 100_000_000);
    const man = Math.floor((price % 100_000_000) / 10_000);
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`;
  }
  return `${(price / 10_000).toFixed(0)}만원`;
}

export function formatPriceShort(price: number): string {
  if (price >= 100_000_000) return `${(price / 100_000_000).toFixed(1)}억`;
  if (price >= 10_000) return `${(price / 10_000).toFixed(0)}만`;
  return String(price);
}

export type RegionMapMarkerOptions = {
  selected?: boolean;
  favorite?: boolean;
  /** 정비사업 레이어 — 핀 색만 강조, 라벨·금액은 유지 */
  developmentHighlight?: boolean;
  developmentLevel?: DevelopmentLevel;
};

export function demoRegionToMapMarker(region: DemoRegion, opts: RegionMapMarkerOptions = {}) {
  const actions = buildPropertyActions({
    districtLabel: region.district,
    aptName: region.popularComplex,
    lat: region.lat,
    lng: region.lng,
    intent: "실거주",
  });
  const pct = region.priceChange;
  const pctHtml =
    pct !== undefined && Number.isFinite(pct)
      ? `<span style="color:${pct >= 0 ? "#e11900" : "#1565d8"}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(2)}%</span>`
      : "";
  const priceLabel = formatPriceShort(region.avgPrice);

  let pinColor: string | undefined;
  if (opts.developmentHighlight) {
    pinColor = opts.developmentLevel === "활발" ? "#F97316" : "#FB923C";
  }

  return {
    id: region.id,
    lat: region.lat,
    lng: region.lng,
    label: region.district,
    avgPriceWon: region.avgPrice,
    priceLabel,
    avgPricePerM2: Math.round(region.avgPrice / 84),
    momPct: region.priceChange,
    tradeCount30d: region.tradingVolume,
    selected: opts.selected,
    favorite: opts.favorite,
    pinColor,
    infoHtml: `<div style="padding:10px 14px;min-width:180px;font-family:sans-serif">
      <p style="font-weight:700;font-size:13px;margin:0 0 2px">${region.city} ${region.district}</p>
      <p style="font-size:14px;font-weight:800;color:#191f28;margin:0 0 4px">${priceLabel} ${pctHtml}</p>
      <p style="font-size:11px;color:#888;margin:0">30일 거래 ${region.tradingVolume}건 · 신규 ${region.newListings}개</p>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;font-size:11px;font-weight:600">
        <a href="${actions.inspectionCreateHref}" style="color:#3182f6">임장노트</a>
        <a href="${actions.listingsHref}" style="color:#3182f6">매물</a>
        <a href="${actions.aiDiagnosisHref}" style="color:#3182f6">AI진단</a>
      </div>
    </div>`,
  };
}
