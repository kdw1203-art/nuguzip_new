/** 임장 허브·홈 대시보드에서 공통으로 쓰는 집계 타입 */

export type HubMetricCounts = {
  notes: number;
  schedules: number;
  meetings: number;
  reports: number;
};

export const EMPTY_HUB_METRICS: HubMetricCounts = {
  notes: 0,
  schedules: 0,
  meetings: 0,
  reports: 0,
};

export function formatHubMetricLabels(counts: HubMetricCounts) {
  return {
    notes: `${counts.notes}개`,
    schedules: `${counts.schedules}건`,
    meetings: `${counts.meetings}회`,
    reports: `${counts.reports}편`,
  } as const;
}

/** API 응답 배열 길이를 안전하게 집계 */
export function hubMetricsFromArrays(input: {
  notes?: unknown[];
  schedules?: unknown[];
  meetings?: unknown[];
  reports?: unknown[];
}): HubMetricCounts {
  return {
    notes: input.notes?.length ?? 0,
    schedules: input.schedules?.length ?? 0,
    meetings: input.meetings?.length ?? 0,
    reports: input.reports?.length ?? 0,
  };
}
