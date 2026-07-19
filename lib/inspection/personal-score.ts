/**
 * #18 개인 가중치 점수 재계산.
 *
 * 5축 점수 × PriorityWeights 로 가중 평균을 구해 "내 기준 점수"(0~100)를 산출.
 *
 * **점수 스케일 단일 소스**: 5축 입력은 앱 전역(UI·DB 마이그레이션 013) 모두
 * `0 ~ AXIS_SCORE_MAX`(별 0~5) 스케일이다. 백분율(0~100)로의 변환은 오직
 * `axisToPercent` 한 지점에서만 수행한다(노트 에디터의 별점·레이더도 동일).
 *
 * - school / transport / price / future 는 PriorityWeights 와 1:1 대응.
 * - location / facility 는 transport 가중치의 50%, price 가중치의 50% 로 분산.
 * - 합이 0이면 균등 평균.
 */

import type { PriorityWeights } from "@/lib/personalization/store";

/** 5축 점수의 최대값(별점). UI·DB 공통 단일 스케일. */
export const AXIS_SCORE_MAX = 5;

/** 5축 점수(0~AXIS_SCORE_MAX)를 백분율(0~100)로 변환하는 유일한 지점. */
export function axisToPercent(value: number): number {
  const clamped = Math.max(0, Math.min(AXIS_SCORE_MAX, value));
  return Math.round((clamped / AXIS_SCORE_MAX) * 100);
}

/** 백분율(0~100)을 5축 점수(0~AXIS_SCORE_MAX)로 역변환. */
export function percentToAxis(percent: number): number {
  const clamped = Math.max(0, Math.min(100, percent));
  return Math.round((clamped / 100) * AXIS_SCORE_MAX);
}

export type FiveAxis = {
  location: number;
  school: number;
  transport: number;
  facility: number;
  future: number;
};

/**
 * @param scores 5축 점수(0~AXIS_SCORE_MAX 스케일). 내부에서 백분율로 정규화한다.
 * @returns score 0~100 백분율
 */
export function personalizedScore(rawScores: FiveAxis, w: PriorityWeights): {
  score: number;
  axisWeights: Record<keyof FiveAxis, number>;
} {
  const scores: FiveAxis = {
    location: axisToPercent(rawScores.location),
    school: axisToPercent(rawScores.school),
    transport: axisToPercent(rawScores.transport),
    facility: axisToPercent(rawScores.facility),
    future: axisToPercent(rawScores.future),
  };
  const wSchool = Math.max(0, w.school);
  const wTransport = Math.max(0, w.transport);
  const wPrice = Math.max(0, w.price);
  const wFuture = Math.max(0, w.future);
  // location ≈ transport*0.7 + price*0.3
  const wLocation = wTransport * 0.7 + wPrice * 0.3;
  // facility ≈ transport*0.5 + future*0.3
  const wFacility = wTransport * 0.5 + wFuture * 0.3;

  const axisWeights: Record<keyof FiveAxis, number> = {
    school: wSchool,
    transport: wTransport,
    location: wLocation,
    facility: wFacility,
    future: wFuture,
  };

  const total = Object.values(axisWeights).reduce((a, b) => a + b, 0);
  if (total <= 0) {
    const avg = (scores.location + scores.school + scores.transport + scores.facility + scores.future) / 5;
    return {
      score: Math.round(avg),
      axisWeights: {
        school: 1,
        transport: 1,
        location: 1,
        facility: 1,
        future: 1,
      },
    };
  }

  const sum =
    scores.school * wSchool +
    scores.transport * wTransport +
    scores.location * wLocation +
    scores.facility * wFacility +
    scores.future * wFuture;

  return {
    score: Math.round(Math.max(0, Math.min(100, sum / total))),
    axisWeights,
  };
}

/**
 * 체크리스트 그룹 ID → 가중치 키 매핑.
 * 그룹별 점수에 PriorityWeights 를 곱해 "개인화 체크리스트 점수"를 만들 때 사용.
 */
export const CHECKLIST_GROUP_WEIGHT: Record<string, keyof PriorityWeights> = {
  location: "transport", // 입지·교통 → 교통 가중치 적용
  complex: "future", // 단지·시설 → 미래가치
  interior: "price", // 내부구조·상태 → 가격(상태)
  school: "school",
  facility: "transport",
  future: "future",
};
