/**
 * 같은 단지 다회차 임장노트 → 비교 표/타임라인용 뷰모델.
 * 가짜 예시를 쓰지 않고 InspectionNote 점수 축만 사용한다.
 */
import {
  inspectionAverageScore,
  type InspectionNote,
  type InspectionScores,
} from "@/lib/inspection/store-db";

export type CellTone = "good" | "avg" | "bad" | "none";

export type CompareHeader = {
  n: string;
  meta: string;
  latest: boolean;
  noteId: string;
};

export type CompareCell = { text: string; tone: CellTone };

export type CompareRow = { label: string; cells: CompareCell[] };

export type CompareScore = { value: number; cls: string };

export type AxisChangeKind = "new" | "drop" | "improve" | "decline" | "lateral";

export type CompareTimelineStep = {
  n: string;
  meta: string;
  latest: boolean;
  score: number;
  scoreDelta: number | null;
  changes: {
    axis: string;
    from: string;
    to: string;
    toTone: CellTone;
    kind: AxisChangeKind;
  }[];
};

export type VisitCompareModel = {
  aptName: string;
  region: string;
  headers: CompareHeader[];
  rows: CompareRow[];
  scores: CompareScore[];
  timeline: CompareTimelineStep[];
  summaryText: string;
  colCount: number;
};

const AXIS: { key: keyof InspectionScores; label: string }[] = [
  { key: "location", label: "입지" },
  { key: "school", label: "학군" },
  { key: "transport", label: "교통" },
  { key: "facility", label: "시설" },
  { key: "future", label: "미래가치" },
];

const TONE_RANK: Record<CellTone, number> = {
  none: 0,
  bad: 1,
  avg: 2,
  good: 3,
};

function scoreToCell(v: number): CompareCell {
  if (!Number.isFinite(v) || v <= 0) return { text: "—", tone: "none" };
  if (v <= 2) return { text: "아쉬움", tone: "bad" };
  if (v === 3) return { text: "보통", tone: "avg" };
  return { text: "좋음", tone: "good" };
}

function totalScore(n: InspectionNote): number {
  return Math.round(inspectionAverageScore(n.scores) * 20);
}

function scoreCls(value: number, latest: boolean): string {
  if (latest) return "text-primary";
  if (value >= 80) return "text-text-1";
  return "text-text-2";
}

function visitMeta(n: InspectionNote): string {
  const parts: string[] = [];
  if (n.visitDate) {
    const d = n.visitDate.slice(5).replace("-", ".");
    parts.push(d);
  }
  if (n.weather?.trim()) parts.push(n.weather.trim());
  return parts.join(" · ") || "방문일 미기록";
}

function buildTimeline(
  headers: CompareHeader[],
  rows: CompareRow[],
  scores: CompareScore[],
): CompareTimelineStep[] {
  return headers.map((h, i) => {
    const score = scores[i].value;
    const prevScore = i > 0 ? scores[i - 1].value : null;
    const changes =
      i === 0
        ? []
        : rows.flatMap((row) => {
            const cur = row.cells[i];
            const prev = row.cells[i - 1];
            if (cur.text === prev.text) return [];
            let kind: AxisChangeKind;
            if (prev.tone === "none") kind = "new";
            else if (cur.tone === "none") kind = "drop";
            else if (TONE_RANK[cur.tone] > TONE_RANK[prev.tone]) kind = "improve";
            else if (TONE_RANK[cur.tone] < TONE_RANK[prev.tone]) kind = "decline";
            else kind = "lateral";
            return [
              {
                axis: row.label,
                from: prev.text,
                to: cur.text,
                toTone: cur.tone,
                kind,
              },
            ];
          });
    return {
      n: h.n,
      meta: h.meta,
      latest: h.latest,
      score,
      scoreDelta: prevScore === null ? null : score - prevScore,
      changes,
    };
  });
}

/** 규칙 기반 한 줄 요약 — LLM이 아니며 출처를 속이지 않는다. */
function buildSummary(notes: InspectionNote[], scores: CompareScore[]): string {
  if (notes.length < 2) {
    return "같은 단지를 2회 이상 기록하면 회차별 점수 변화를 비교할 수 있어요.";
  }
  const first = scores[0].value;
  const last = scores[scores.length - 1].value;
  const delta = last - first;
  const deltaLabel =
    delta > 0 ? `${delta}점 상승` : delta < 0 ? `${Math.abs(delta)}점 하락` : "점수 유지";

  const lastNote = notes[notes.length - 1];
  const firstNote = notes[0];
  const weak: string[] = [];
  const strong: string[] = [];
  for (const a of AXIS) {
    const a0 = firstNote.scores[a.key];
    const a1 = lastNote.scores[a.key];
    if (a1 > 0 && a1 <= 2) weak.push(a.label);
    if (a1 >= 4 && (a0 <= 0 || a1 >= a0)) strong.push(a.label);
  }

  const parts = [
    `${notes.length}회 방문 · 종합 ${first}→${last} (${deltaLabel}).`,
  ];
  if (strong.length) parts.push(`최근 강점: ${strong.slice(0, 3).join("·")}.`);
  if (weak.length) parts.push(`최근 약점: ${weak.slice(0, 3).join("·")}.`);
  parts.push("작성자 점수 축 기준 · AI 생성 문장이 아닙니다.");
  return parts.join(" ");
}

/**
 * 방문일 오름차순 노트 묶음 → 비교 모델.
 * 최대 8회차까지 (표가 깨지지 않게).
 */
export function buildVisitCompareModel(notes: InspectionNote[]): VisitCompareModel | null {
  if (notes.length === 0) return null;
  const sorted = [...notes].sort(
    (a, b) =>
      a.visitDate.localeCompare(b.visitDate) || a.createdAt.localeCompare(b.createdAt),
  );
  const slice = sorted.slice(0, 8);
  const colCount = slice.length;
  const headers: CompareHeader[] = slice.map((n, i) => ({
    n: i === colCount - 1 ? `${i + 1}차 (최신)` : `${i + 1}차`,
    meta: visitMeta(n),
    latest: i === colCount - 1,
    noteId: n.id,
  }));
  const rows: CompareRow[] = AXIS.map((a) => ({
    label: a.label,
    cells: slice.map((n) => scoreToCell(n.scores[a.key])),
  }));
  const scores: CompareScore[] = slice.map((n, i) => {
    const value = totalScore(n);
    return { value, cls: scoreCls(value, i === colCount - 1) };
  });
  const timeline = buildTimeline(headers, rows, scores);
  const aptName = slice[slice.length - 1].aptName?.trim() || "단지";
  const region = slice[slice.length - 1].region?.trim() || "";
  return {
    aptName,
    region,
    headers,
    rows,
    scores,
    timeline,
    summaryText: buildSummary(slice, scores),
    colCount,
  };
}
