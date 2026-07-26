import "server-only";

import { getRegionSeries, getRegionMonthlyVolume, type RegionMonthlyVolumeRow } from "@/lib/market/store";
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";

/**
 * 시장 온도 계산 — /analysis/timing 과 주간 아카이브가 **같은 코드**를 쓰기 위한 모듈.
 *
 * ── 왜 파일을 따로 뺐나 ────────────────────────────────────────────────
 * 이 계산식은 원래 app/analysis/timing/page.tsx 안에 모듈 프라이빗으로 있었다.
 * N11(주간 아카이브)은 같은 점수를 매주 저장해야 하는데, 저장하는 쪽이 계산을
 * 다시 구현하면 두 숫자가 언젠가 갈라진다. 그 순간 아카이브는 "과거의 시장
 * 온도"가 아니라 "과거에 다른 공식으로 계산한 무언가"가 된다 — 사실 우선
 * 원칙에 정면으로 어긋난다. 그래서 계산은 여기 한 곳에만 둔다.
 *
 * 페이지도 스냅샷 작성기도 이 파일의 computeMarketTemp() 만 부른다.
 * 공식을 바꿀 일이 생기면 formulaVersion 을 올리고, 아카이브에는 그 버전이
 * 같이 저장되므로 "언제부터 다른 공식인지"를 나중에도 말할 수 있다.
 */

/**
 * 공식 버전. 계산 규칙(가중치·스케일·밴드)을 바꾸면 반드시 올린다.
 * 스냅샷 행마다 저장되므로, 과거 값을 지금 공식으로 다시 계산한 것처럼
 * 보이게 만들지 않는다.
 */
export const TEMPERATURE_FORMULA_VERSION = 1;

export type SeriesPoint = { period: string; value: number };

export type TrendResult = {
  verdict: string;
  detail: string;
  points: SeriesPoint[];
  changes: number[];
  periodType: "monthly" | "weekly";
  latestChangePct: number;
  cumulativePct: number;
};

export function pctChanges(points: SeriesPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1].value;
    out.push(prev ? ((points[i].value - prev) / prev) * 100 : 0);
  }
  return out;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 추세/모멘텀 규칙 판정 — 최근 3구간 평균 변동 vs 직전 3구간 비교 */
export function judgeTrend(
  points: SeriesPoint[],
  periodType: "monthly" | "weekly",
): TrendResult | null {
  if (points.length < 4) return null;
  const changes = pctChanges(points);
  const recent = mean(changes.slice(-3));
  const prior = mean(changes.slice(-6, -3));
  const latest = changes[changes.length - 1] ?? 0;
  const cumulative = points[0].value
    ? ((points[points.length - 1].value - points[0].value) / points[0].value) * 100
    : 0;
  const unit = periodType === "monthly" ? "월" : "주";
  const th = periodType === "monthly" ? 0.15 : 0.05;

  let verdict: string;
  let detail: string;
  if (recent > th && recent >= prior) {
    verdict = "상승 지속";
    detail = `최근 3개${unit} 평균 +${recent.toFixed(2)}%로 직전(${prior >= 0 ? "+" : ""}${prior.toFixed(2)}%)보다 강한 상승 흐름이에요.`;
  } else if (recent > th && recent < prior) {
    verdict = "상승 둔화";
    detail = `상승세가 이어지지만 폭이 ${prior.toFixed(2)}% → ${recent.toFixed(2)}%로 줄었어요. 고점 추격은 신중히.`;
  } else if (recent < -th && recent <= prior) {
    verdict = "하락 지속";
    detail = `최근 3개${unit} 평균 ${recent.toFixed(2)}%로 조정이 이어지고 있어요. 급매 중심으로 관찰할 시기예요.`;
  } else if (recent < -th && recent > prior) {
    verdict = "하락 둔화";
    detail = `하락 폭이 ${prior.toFixed(2)}% → ${recent.toFixed(2)}%로 줄었어요. 바닥 다지기 가능성을 지켜보세요.`;
  } else if (prior < -th && recent >= -th) {
    verdict = "반등 조짐";
    detail = `직전 조정(${prior.toFixed(2)}%) 이후 최근 흐름이 보합권(${recent >= 0 ? "+" : ""}${recent.toFixed(2)}%)으로 돌아섰어요.`;
  } else {
    verdict = "보합권";
    detail = `최근 3개${unit} 평균 변동이 ${recent >= 0 ? "+" : ""}${recent.toFixed(2)}%로 뚜렷한 방향성이 없어요.`;
  }
  return {
    verdict,
    detail,
    points,
    changes,
    periodType,
    latestChangePct: latest,
    cumulativePct: cumulative,
  };
}

export async function loadTrend(regionId: string): Promise<TrendResult | null> {
  try {
    // 12개월 지수 (13개 값 → 12개 변동) 우선, 없으면 주간 시리즈로 대체
    const monthly = await getRegionSeries(regionId, "sale_index", "monthly", 13);
    if (monthly.length >= 4) return judgeTrend(monthly, "monthly");
    const weekly = await getRegionSeries(regionId, "sale_index", "weekly", 27);
    if (weekly.length >= 4) return judgeTrend(weekly, "weekly");
    return null;
  } catch {
    return null;
  }
}

export function currentYyyymm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 시장 온도 결과.
 *
 * `inputs` 는 화면에 그대로 찍는 표시용 문자열이고, `raw` 는 같은 값의 숫자
 * 원본이다. 아카이브가 표시 문자열을 파싱해서 되돌리는 일이 없도록 —
 * "+1.23%" 를 다시 1.23 으로 파싱하는 코드는 반올림 때문에 언젠가 어긋난다 —
 * 계산한 쪽이 숫자를 그대로 넘긴다.
 */
export type MarketTemp = {
  score: number;
  headline: string;
  inputs: { label: string; value: string; accent: boolean }[];
  volumeNote: string | null;
  raw: {
    periodType: "monthly" | "weekly";
    /** 지수 최근 3구간 평균 변동률(%) */
    momentumPct: number;
    /** 지수 직전 3구간 평균 변동률(%) */
    priorPct: number;
    /** 지수 모멘텀이 점수에 기여한 값(-25~+25) */
    momentumPoints: number;
    /** 거래량 추이가 점수에 기여한 값(-25~+25). 반영 못 했으면 0 */
    volumePoints: number;
    /** 거래량 비교에 쓴 완결월 수(한쪽 기준). 반영 못 했으면 null */
    volumeWindowMonths: number | null;
    volumeRecentCount: number | null;
    volumePriorCount: number | null;
    volumeDeltaPct: number | null;
    /** 지수 시리즈의 마지막 값 — 아카이브에서 점수와 지수를 나란히 보기 위한 것 */
    indexLatest: number | null;
    /** 지수 시리즈의 마지막 구간 라벨(예: "2026-06-01") */
    indexLatestPeriod: string | null;
    formulaVersion: number;
  };
};

/**
 * 시장 온도(0~100) — 50이 중립. 지수 모멘텀 ±25점 + 거래량 추이 ±25점.
 * 거래량은 신고 지연이 있는 이번 달을 제외하고, 완결월 4개 이상일 때만 반영한다.
 */
export function computeMarketTemp(
  trend: TrendResult | null,
  volume: RegionMonthlyVolumeRow[],
): MarketTemp | null {
  if (!trend) return null;
  const unit = trend.periodType === "monthly" ? "월" : "주";
  const recent = mean(trend.changes.slice(-3));
  const prior = mean(trend.changes.slice(-6, -3));
  // 월 ±1% 변동을 ±25점 만점으로 환산 (주간이면 ±0.3%)
  const momScale = trend.periodType === "monthly" ? 25 : 83;
  const momPts = clamp(recent * momScale, -25, 25);

  const inputs: MarketTemp["inputs"] = [
    {
      label: `지수 최근 3개${unit} 평균`,
      value: `${recent >= 0 ? "+" : ""}${recent.toFixed(2)}%`,
      accent: recent > 0,
    },
    {
      label: `직전 3개${unit} 평균`,
      value: `${prior >= 0 ? "+" : ""}${prior.toFixed(2)}%`,
      accent: false,
    },
  ];

  // 거래량: 이번 달(신고 지연) 제외한 완결월만
  const nowYm = currentYyyymm();
  const complete = volume.filter((v) => v.month < nowYm);
  let volPts = 0;
  let volumeNote: string | null = null;
  let volumeWindowMonths: number | null = null;
  let volumeRecentCount: number | null = null;
  let volumePriorCount: number | null = null;
  let volumeDeltaPct: number | null = null;
  if (complete.length >= 4) {
    const half = Math.min(3, Math.floor(complete.length / 2));
    const recentMonths = complete.slice(-half);
    const priorMonths = complete.slice(-half * 2, -half);
    const recentSum = recentMonths.reduce((s, v) => s + v.count, 0);
    const priorSum = priorMonths.reduce((s, v) => s + v.count, 0);
    if (priorSum > 0) {
      const deltaPct = ((recentSum - priorSum) / priorSum) * 100;
      volPts = clamp(deltaPct * 0.5, -25, 25); // ±50% 변화를 ±25점으로
      volumeWindowMonths = half;
      volumeRecentCount = recentSum;
      volumePriorCount = priorSum;
      volumeDeltaPct = deltaPct;
      inputs.push({
        label: `거래량 최근 ${half}개월 합`,
        value: `${recentSum.toLocaleString("ko-KR")}건 (직전 ${priorSum.toLocaleString("ko-KR")}건, ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(0)}%)`,
        accent: deltaPct > 0,
      });
    }
  } else {
    volumeNote =
      complete.length > 0
        ? `거래량 완결월이 ${complete.length}개뿐이라 신호에는 지수 모멘텀만 반영했어요.`
        : "이 지역의 월별 거래량 집계가 아직 없어 신호에는 지수 모멘텀만 반영했어요.";
  }

  const score = Math.round(clamp(50 + momPts + volPts, 5, 95));
  const headline = temperatureHeadline(score);
  const lastPoint = trend.points[trend.points.length - 1];
  return {
    score,
    headline,
    inputs,
    volumeNote,
    raw: {
      periodType: trend.periodType,
      momentumPct: recent,
      priorPct: prior,
      momentumPoints: momPts,
      volumePoints: volPts,
      volumeWindowMonths,
      volumeRecentCount,
      volumePriorCount,
      volumeDeltaPct,
      indexLatest: lastPoint ? lastPoint.value : null,
      indexLatestPeriod: lastPoint ? lastPoint.period : null,
      formulaVersion: TEMPERATURE_FORMULA_VERSION,
    },
  };
}

/** 점수 → 한 줄 요약. 아카이브가 저장된 점수로 같은 문장을 되살릴 수 있게 분리했다. */
export function temperatureHeadline(score: number): string {
  return score >= 65
    ? "가격·거래 모두 달아오르는 구간"
    : score >= 55
      ? "완만한 회복 흐름"
      : score >= 45
        ? "방향성 탐색 구간"
        : score >= 35
          ? "조정 흐름 지속"
          : "가격·거래 모두 식은 구간";
}

/* ── 지역 목록 ─────────────────────────────────────────────────────────
   /analysis/timing 의 선택지와 아카이브의 수집 대상은 같은 목록이어야 한다.
   한쪽에만 지역이 늘면 "화면에는 있는데 아카이브에는 없는 지역"이 생긴다. */
export type TemperatureRegion = { id: string; label: string; name: string };

export const TEMPERATURE_REGIONS: readonly TemperatureRegion[] = [
  ...SEOUL_DISTRICTS.map((d) => ({ id: d.id, label: `서울 ${d.name}`, name: d.name })),
  ...METRO_EXPLORE_DISTRICTS.map((d) => ({
    id: d.id,
    label: `${d.city ?? "서울"} ${d.name}`,
    name: d.name,
  })),
];

export function findTemperatureRegion(regionId: string): TemperatureRegion | null {
  return TEMPERATURE_REGIONS.find((r) => r.id === regionId) ?? null;
}

/** 한 지역의 온도를 지금 데이터로 계산한다 (페이지·스냅샷 공용 진입점). */
export async function computeRegionTemperature(
  region: TemperatureRegion,
): Promise<{ trend: TrendResult | null; volume: RegionMonthlyVolumeRow[]; temp: MarketTemp | null }> {
  const [trend, volume] = await Promise.all([
    loadTrend(region.id),
    getRegionMonthlyVolume(region.id, region.name, 12),
  ]);
  return { trend, volume, temp: computeMarketTemp(trend, volume) };
}

/* ── 주 단위 경계 ───────────────────────────────────────────────────────
   스냅샷의 키는 "그 주의 월요일(KST)" 이다. UTC 로 계산하면 한국의 월요일
   오전 8시가 아직 일요일이라 한 주가 밀린다. 서버가 어느 시간대에 있든 같은
   답이 나오도록 KST(UTC+9) 로 고정한다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 주어진 시각이 속한 KST 주의 월요일을 'YYYY-MM-DD' 로 돌려준다. */
export function kstWeekStart(at: Date = new Date()): string {
  const kst = new Date(at.getTime() + KST_OFFSET_MS);
  const dow = kst.getUTCDay(); // 0=일 … 6=토 (KST 기준으로 이동시킨 값)
  const backToMonday = (dow + 6) % 7; // 월요일이면 0, 일요일이면 6
  const monday = new Date(kst.getTime() - backToMonday * 24 * 60 * 60 * 1000);
  return monday.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → "26.07.20" (차트 축·표 라벨) */
export function formatWeekLabel(weekStart: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : weekStart;
}

/** 'YYYY-MM-DD' → "2026년 7월 20일" (본문 문장용) */
export function formatWeekKorean(weekStart: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : weekStart;
}
