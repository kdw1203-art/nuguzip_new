/**
 * 구(區) 단위 시세 히트맵 — 지도 편의 레이어(#8)의 "시세" 토글용 결정적 데이터.
 *
 * seoul-districts 의 `avgPricePerM2`(원/㎡)를 5단계 티어로 나눠 지도에 색으로 표현한다.
 * 실데이터 전환 시에도 `SEOUL_DISTRICTS`/`METRO_EXPLORE_DISTRICTS` 만 교체하면 그대로 동작.
 */
import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
  type SeoulDistrictInfo,
} from "@/lib/map/seoul-districts";

/** 시세 히트맵 대상 구 목록 (서울 + 수도권) */
export const PRICE_HEAT_DISTRICTS: SeoulDistrictInfo[] = [
  ...SEOUL_DISTRICTS,
  ...METRO_EXPLORE_DISTRICTS,
];

export interface PriceTier {
  /** 0(저) ~ 4(고) */
  level: number;
  /** 이 티어의 하한 (원/㎡, 포함) */
  min: number;
  /** 마커·범례 색 (light→deep, --primary #1d4fd8 계열) */
  color: string;
  /** 범례 양끝 표기 (중간 티어는 빈 문자열) */
  label: string;
}

/** 5단계 시세 티어 — 저(연한 블루) → 고(진한 블루). 참고용 목업 임계값. */
export const PRICE_TIERS: PriceTier[] = [
  { level: 0, min: 0, color: "#7ba0e8", label: "저" },
  { level: 1, min: 9_000_000, color: "#5580dd", label: "" },
  { level: 2, min: 12_000_000, color: "#3563d2", label: "" },
  { level: 3, min: 16_000_000, color: "#2247b0", label: "" },
  { level: 4, min: 20_000_000, color: "#15307e", label: "고" },
];

/** 원/㎡ → 해당 시세 티어 (없으면 최저 티어) */
export function priceTier(avgPricePerM2: number | undefined): PriceTier {
  const v = avgPricePerM2 ?? 0;
  let tier = PRICE_TIERS[0];
  for (const t of PRICE_TIERS) {
    if (v >= t.min) tier = t;
  }
  return tier;
}

/** 평당(3.3058㎡) 근사 시세 라벨 — 예: "평당 8,265만" / "평당 1.2억" */
export function pyeongPriceLabel(avgPricePerM2: number | undefined): string {
  const v = avgPricePerM2 ?? 0;
  if (!Number.isFinite(v) || v <= 0) return "평당 -";
  const perPyeongManwon = (v * 3.3058) / 10_000; // 원/㎡ → 만원/평
  if (perPyeongManwon >= 10_000) {
    const eok = perPyeongManwon / 10_000;
    return `평당 ${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
  }
  return `평당 ${Math.round(perPyeongManwon).toLocaleString("ko-KR")}만`;
}
