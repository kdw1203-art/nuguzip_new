import type { InspectionNote } from "@/lib/inspection/store-db";

/* [#72] 재방문 변화 리포트 — 같은 단지 2회차 이상일 때, 직전 회차와 이번 회차의
 * 차이를 자동 요약한다("소음 보통→아쉬움, 만족도 6→8"). 순수 함수 — 조회 없음,
 * 호출부(노트 상세)가 이미 읽어 둔 회차 묶음을 그대로 쓴다.
 *
 * 원칙: 실제로 **바뀐 항목만** 문장으로 만든다. 없는 값(미입력)은 비교 자체를
 * 만들지 않는다 — "미입력→보통"은 변화가 아니라 기록 습관의 차이다.
 */

export type RevisitDelta = {
  /** "2차 → 3차" 라벨 */
  fromLabel: string;
  toLabel: string;
  prevVisitDate: string;
  /** 바뀐 항목 문장들 — 비어 있으면 "변화 없음"이 사실 */
  changes: string[];
  /** 두 회차 모두 기록된 비교 가능 항목 수 (0이면 리포트 자체를 만들지 않는 것이 옳다) */
  comparable: number;
};

const SCORE_LABELS: Array<{ key: keyof NonNullable<InspectionNote["scores"]>; label: string }> = [
  { key: "location", label: "입지" },
  { key: "school", label: "학군" },
  { key: "transport", label: "교통" },
  { key: "facility", label: "시설" },
  { key: "future", label: "미래가치" },
];

function fieldRatings(n: InspectionNote): Record<string, string> {
  const raw = n.metadata?.["fieldRatings" as keyof typeof n.metadata];
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function satisfactionOf(n: InspectionNote): number | null {
  const v = n.metadata?.satisfaction;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * prev(직전 회차) → curr(이번 회차) 변화 요약. 비교 가능 항목이 0이면 null.
 */
export function buildRevisitDelta(
  prev: InspectionNote,
  curr: InspectionNote,
  fromIdx: number,
  toIdx: number,
): RevisitDelta | null {
  const changes: string[] = [];
  let comparable = 0;

  /* 현장 감각 평가(좋음/보통/아쉬움) — 항목별 원본이 있으면 이것이 가장 구체적 */
  const pf = fieldRatings(prev);
  const cf = fieldRatings(curr);
  const fieldKeys = Object.keys(cf).filter((k) => k in pf);
  for (const k of fieldKeys) {
    comparable += 1;
    if (pf[k] !== cf[k]) changes.push(`${k} ${pf[k]}→${cf[k]}`);
  }

  /* 5축 점수 — 항목별 원본이 없을 때의 폴백 (양쪽 다 기록된 축만) */
  if (fieldKeys.length === 0 && prev.scores && curr.scores) {
    for (const { key, label } of SCORE_LABELS) {
      const a = prev.scores[key];
      const b = curr.scores[key];
      if (typeof a === "number" && typeof b === "number" && a > 0 && b > 0) {
        comparable += 1;
        if (a !== b) changes.push(`${label} ${a}→${b}`);
      }
    }
  }

  /* 종합 만족도 슬라이더 (0~10) */
  const ps = satisfactionOf(prev);
  const cs = satisfactionOf(curr);
  if (ps !== null && cs !== null) {
    comparable += 1;
    if (ps !== cs) changes.push(`만족도 ${ps}→${cs}`);
  }

  /* 체크 완료 수 */
  const pDone = prev.checklist.filter((c) => c.done).length;
  const cDone = curr.checklist.filter((c) => c.done).length;
  if (prev.checklist.length > 0 && curr.checklist.length > 0) {
    comparable += 1;
    if (pDone !== cDone) changes.push(`체크 완료 ${pDone}→${cDone}개`);
  }

  if (comparable === 0) return null;
  return {
    fromLabel: `${fromIdx + 1}차`,
    toLabel: `${toIdx + 1}차`,
    prevVisitDate: prev.visitDate,
    changes,
    comparable,
  };
}
