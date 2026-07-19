/**
 * 지역 시세 상세 합성기 — 타 사이트(호갱노노·아실·네이버부동산) 대비 누락 지표 보강.
 * DemoRegion 의 84㎡ 평균 매매가를 기준으로 평형별 시세·전세가율·갭·평단가·월별 거래량을
 * 결정론적으로 역산한다(랜덤 미사용 → SSR/하이드레이션 안전).
 */
import type { DemoRegion } from "@/lib/region/explore-data";

const M2_PER_PYEONG = 3.305785;

/** 강남3구 + 용산: 2026년 기준 규제 유지 권역 (그 외 비규제로 가정) */
const SPECULATION_ZONES = new Set(["강남구", "서초구", "송파구", "용산구"]);

export type AreaPrice = {
  /** 표기 라벨 (예: "전용 84㎡") */
  label: string;
  /** 전용면적(㎡) */
  areaM2: number;
  /** 평 환산 */
  pyeong: number;
  /** 추정 매매가(원) */
  sale: number;
  /** 추정 전세가(원) */
  jeonse: number;
};

export type RegulationInfo = {
  zone: string;
  tone: string;
  note: string;
};

export type RegionMarket = {
  /** 평단가(원/평) */
  perPyeong: number;
  /** ㎡당 단가(원) */
  perM2: number;
  /** 전세가율(%) */
  jeonseRatioPct: number;
  /** 84㎡ 기준 갭(매매-전세, 원) */
  gap: number;
  /** 평형별 시세 */
  areas: AreaPrice[];
  /** 규제 정보 */
  regulation: RegulationInfo;
};

/** 가격대가 높을수록 전세가율이 낮아지는 현실 패턴을 반영한 결정론적 전세가율(%) */
function estimateJeonseRatioPct(perM2: number): number {
  // 6백만/㎡ → ~72%, 25백만/㎡ → ~48%
  const ratio = 0.74 - ((perM2 - 6_000_000) / 19_000_000) * 0.26;
  const clamped = Math.min(0.74, Math.max(0.46, ratio));
  return Math.round(clamped * 1000) / 10;
}

function roundToManwon(won: number): number {
  return Math.round(won / 10_000) * 10_000;
}

export function getRegionMarket(region: DemoRegion): RegionMarket {
  const perM2 = Math.round(region.avgPrice / 84);
  const perPyeong = Math.round(perM2 * M2_PER_PYEONG);
  // 실데이터(KB·한국부동산원) 전세가율이 있으면 우선, 없으면 결정론적 추정
  const jeonseRatioPct =
    typeof region.jeonseRatioPct === "number" && region.jeonseRatioPct > 0
      ? region.jeonseRatioPct
      : estimateJeonseRatioPct(perM2);
  const jeonseRatio = jeonseRatioPct / 100;

  // 소형은 ㎡당 단가 프리미엄, 대형은 디스카운트 (실제 시장 패턴)
  const areaDefs: Array<{ label: string; areaM2: number; mult: number }> = [
    { label: "전용 59㎡", areaM2: 59, mult: 1.06 },
    { label: "전용 84㎡", areaM2: 84, mult: 1.0 },
    { label: "전용 114㎡", areaM2: 114, mult: 0.95 },
  ];

  const areas: AreaPrice[] = areaDefs.map((d) => {
    const sale = roundToManwon(perM2 * d.areaM2 * d.mult);
    const jeonse = roundToManwon(sale * jeonseRatio);
    return {
      label: d.label,
      areaM2: d.areaM2,
      pyeong: Math.round(d.areaM2 / M2_PER_PYEONG),
      sale,
      jeonse,
    };
  });

  const base84 = areas.find((a) => a.areaM2 === 84) ?? areas[0];
  const gap = base84.sale - base84.jeonse;

  const regulated = SPECULATION_ZONES.has(region.district);
  const regulation: RegulationInfo = regulated
    ? {
        zone: "투기과열지구·조정대상지역",
        tone: "bg-rose-50 text-rose-600 border-rose-200",
        note: "LTV·전매·자금조달계획서 등 규제 적용 권역",
      }
    : {
        zone: "비규제지역",
        tone: "bg-emerald-50 text-emerald-600 border-emerald-200",
        note: "대출·전매 규제 완화 권역 (실수요 진입 용이)",
      };

  return { perPyeong, perM2, jeonseRatioPct, gap, areas, regulation };
}

/** 월별 실거래량 추이(최근 6개월) — tradingVolume 기준 결정론적 합성 */
export function buildTradeVolumeTrend(region: DemoRegion): { months: string[]; counts: number[] } {
  const now = new Date();
  const months: string[] = [];
  const counts: number[] = [];
  const base = region.tradingVolume;
  // priceChange 가 클수록 최근으로 갈수록 거래량 증가 추세
  const slope = region.priceChange * 0.04;
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getMonth() + 1}월`);
    const idx = 5 - i;
    const wobble = Math.round(Math.sin(idx + (region.tradingVolume % 5)) * (base * 0.08));
    const trend = Math.round(base * slope * (idx - 2.5));
    counts.push(Math.max(1, base + trend + wobble));
  }
  return { months, counts };
}
