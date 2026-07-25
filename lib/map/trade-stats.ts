/**
 * 실거래 전월비 표기 공통 헬퍼 — 지도·단지 패널이 같은 규칙을 쓰게 한다.
 *
 * 원칙(정직한 표기):
 * - 전월 데이터가 없으면 "—" (없는 비교를 지어내지 않는다)
 * - 최신월 표본이 MIN_DELTA_SAMPLE(3건) 미만이면 ▲/▼% 대신 "표본 부족" —
 *   1~2건 평균의 등락률은 시세 신호가 아니라 노이즈이기 때문이다.
 */

export const MIN_DELTA_SAMPLE = 3;

export type DeltaTone = "up" | "down" | "flat";

export interface DeltaView {
  delta: string;
  tone: DeltaTone;
  /** true면 표본 부족으로 등락률 표기를 생략한 것 (전월비 문구도 붙이지 말 것) */
  lowSample: boolean;
}

/** 전월 대비 % (소수 1자리). 비교 불가면 null */
export function pctDelta(curr: number, prev: number | undefined | null): number | null {
  if (!prev || prev <= 0 || !Number.isFinite(curr)) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

/**
 * 전월비 라벨. sampleCount 는 등락률의 분자(최신월) 거래 건수 —
 * MIN_DELTA_SAMPLE 미만이면 %를 계산해도 표시하지 않는다.
 */
export function deltaLabel(pct: number | null, sampleCount?: number | null): DeltaView {
  if (
    sampleCount != null &&
    Number.isFinite(sampleCount) &&
    sampleCount < MIN_DELTA_SAMPLE &&
    pct !== null
  ) {
    return { delta: "표본 부족", tone: "flat", lowSample: true };
  }
  if (pct === null || pct === 0) return { delta: "—", tone: "flat", lowSample: false };
  return pct > 0
    ? { delta: `▲ ${Math.abs(pct).toFixed(1)}%`, tone: "up", lowSample: false }
    : { delta: `▼ ${Math.abs(pct).toFixed(1)}%`, tone: "down", lowSample: false };
}
