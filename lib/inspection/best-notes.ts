import "server-only";

import { listPublicNotes, type InspectionNote } from "./store-db";

/**
 * N13 — 이달의 공개 임장노트.
 *
 * ── 왜 "고르지" 않고 "재는가" ──────────────────────────────────────────────
 * 큐레이션은 조용히 광고가 되기 쉽다. 운영자가 마음에 드는 노트를 골라 상단에
 * 올리면, 읽는 사람은 그게 왜 뽑혔는지 알 수 없고 작성자는 무엇을 더 써야
 * 뽑히는지 알 수 없다. 그래서 이 모듈은 **사람이 고르지 않는다**. 아래 다섯
 * 축을 각각 상한을 둔 점수로 재서 합산하고, 그 계산식을 페이지에 그대로
 * 공개한다(문서 N13 의 "선정 기준 공개").
 *
 * ── 재는 것은 '충실함'이지 '좋은 집'이 아니다 ─────────────────────────────
 * 여기서 나오는 점수는 **기록이 얼마나 자세한가**만 말한다. 그 단지가 좋은
 * 단지인지, 살 만한 값인지와는 아무 상관이 없다. 노트 안의 항목 점수(입지·학군
 * 등)가 높다고 가산점을 주지 않는 이유가 이것이다 — 그걸 더하는 순간 "높은
 * 점수를 준 노트가 뽑힌다" 가 되어, 후하게 쓸 유인이 생긴다. 우리는 다섯 항목을
 * 다 채웠는지(성실함)만 보고, 몇 점을 줬는지는 보지 않는다.
 *
 * ── 뽑히지 않는 달은 만들지 않는다 ────────────────────────────────────────
 * 자격 노트가 MIN_NOTES_PER_MONTH 개 미만인 달은 페이지를 만들지 않는다.
 * 두 편짜리 "이달의 노트" 는 큐레이션이 아니라 그냥 그 달에 올라온 전부이고,
 * 그걸 선정으로 부르면 없는 선별을 있는 척하는 것이다.
 *
 * 조회 실패는 던진다(listPublicNotes 가 던진다) — 부르는 쪽이 404 와 5xx 를
 * 구분해야 한다. "이달의 노트가 없다" 와 "DB 를 못 읽었다" 는 다른 사실이다.
 */

/** 한 축이 결과를 독식하지 못하도록 전부 상한을 둔다. 합계 100점. */
export type ScoreAxis = {
  key: string;
  label: string;
  /** 만점 */
  max: number;
  /** 만점을 받는 기준값 */
  full: number;
  unit: string;
  /** 화면에 그대로 적는 설명 */
  how: string;
};

export const SCORE_AXES: readonly ScoreAxis[] = [
  {
    key: "text",
    label: "현장 기록 분량",
    max: 30,
    full: 800,
    unit: "자",
    how: "장점·단점·입지·학군·교통·편의·미래·메모 칸에 적은 글자 수를 모두 더합니다. 800자에서 만점입니다.",
  },
  {
    key: "photo",
    label: "현장 사진",
    max: 20,
    full: 6,
    unit: "장",
    how: "노트에 첨부된 사진 수입니다. 6장에서 만점입니다.",
  },
  {
    key: "evidence",
    label: "공공데이터·실거래 근거",
    max: 25,
    full: 5,
    unit: "건",
    how: "노트에 붙인 공공데이터 조회 결과와 실거래 근거의 수입니다. 5건에서 만점입니다.",
  },
  {
    key: "checklist",
    label: "체크리스트 확인",
    max: 15,
    full: 10,
    unit: "개",
    how: "현장에서 실제로 확인 표시한 체크 항목 수입니다. 10개에서 만점입니다.",
  },
  {
    key: "coverage",
    label: "항목 빠짐없이 작성",
    max: 10,
    full: 5,
    unit: "개",
    how: "입지·학군·교통·편의·미래 다섯 항목을 모두 평가했는지만 봅니다. 몇 점을 줬는지는 보지 않습니다.",
  },
];

export const MAX_SCORE = SCORE_AXES.reduce((s, a) => s + a.max, 0);

/** 이 점수 미만은 "이달의 노트" 후보로 세지 않는다. */
export const MIN_SCORE = 40;
/** 자격 노트가 이보다 적은 달은 페이지를 만들지 않는다. */
export const MIN_NOTES_PER_MONTH = 3;
/** 한 달에 보여 주는 최대 편수. */
export const MAX_NOTES_PER_MONTH = 10;
/** 같은 작성자가 한 달을 독식하지 않도록 — 작성자당 최대 편수. */
export const MAX_PER_AUTHOR = 2;

export type NoteScoreBreakdown = {
  key: string;
  label: string;
  /** 실측 원값 (글자 수, 사진 수 …) */
  raw: number;
  unit: string;
  points: number;
  max: number;
};

export type ScoredNote = {
  note: InspectionNote;
  total: number;
  breakdown: NoteScoreBreakdown[];
  /** 노트 작성 월 (KST 기준 yyyymm) */
  ym: string;
};

function capped(raw: number, axis: ScoreAxis): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(Math.min(1, raw / axis.full) * axis.max);
}

function textLength(note: InspectionNote): number {
  const s = note.sections ?? {};
  return [s.pros, s.cons, s.location, s.school, s.transport, s.facility, s.future, s.memo]
    .map((v) => (typeof v === "string" ? v.trim().length : 0))
    .reduce((a, b) => a + b, 0);
}

function evidenceCount(note: InspectionNote): number {
  const m = note.metadata ?? {};
  return (m.publicDataRefs?.length ?? 0) + (m.evidenceRefs?.length ?? 0);
}

function checklistDone(note: InspectionNote): number {
  return (note.checklist ?? []).filter((c) => c && c.done).length;
}

function scoredAxes(note: InspectionNote): number {
  const s = note.scores;
  if (!s) return 0;
  return [s.location, s.school, s.transport, s.facility, s.future].filter(
    (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  ).length;
}

/** KST 기준 yyyymm. 작성 시각이 UTC 로 저장되므로 9시간을 더해 판정한다. */
export function ymOfIso(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const kst = new Date(t + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function scoreNote(note: InspectionNote): ScoredNote | null {
  const ym = ymOfIso(note.createdAt);
  if (!ym) return null;

  const raws: Record<string, number> = {
    text: textLength(note),
    photo: (note.photos ?? []).length,
    evidence: evidenceCount(note),
    checklist: checklistDone(note),
    coverage: scoredAxes(note),
  };

  const breakdown: NoteScoreBreakdown[] = SCORE_AXES.map((axis) => ({
    key: axis.key,
    label: axis.label,
    raw: raws[axis.key] ?? 0,
    unit: axis.unit,
    points: capped(raws[axis.key] ?? 0, axis),
    max: axis.max,
  }));

  return {
    note,
    ym,
    total: breakdown.reduce((s, b) => s + b.points, 0),
    breakdown,
  };
}

export type BestNotesMonth = {
  ym: string;
  /** 자격(MIN_SCORE 이상)을 갖춘 노트 수 — 그중 상위만 picks 에 담긴다 */
  qualifiedCount: number;
  /** 그 달에 공개된 노트 전체 수 (자격 미달 포함) */
  totalCount: number;
  picks: ScoredNote[];
};

/**
 * 공개 노트 전체를 한 번 읽고 월별로 접는다. 노트 수가 수백 규모라 한 번에
 * 읽어 JS 에서 계산하는 편이 월마다 질의하는 것보다 싸고, 무엇보다 "같은
 * 계산식으로 모든 달을 매겼다" 는 보장이 코드에 그대로 드러난다.
 */
export async function listBestNoteMonths(limit = 500): Promise<BestNotesMonth[]> {
  return bestNoteMonthsFrom(await listPublicNotes(limit));
}

/**
 * 순수 함수 — 이미 읽어 둔 노트 목록으로 월별 선정을 계산한다.
 * 사이트맵처럼 공개 노트를 이미 한 번 읽은 곳에서 같은 질의를 또 던지지
 * 않기 위해 분리했다. 계산식은 listBestNoteMonths 와 완전히 동일하다.
 */
export function bestNoteMonthsFrom(notes: InspectionNote[]): BestNotesMonth[] {
  const byYm = new Map<string, { scored: ScoredNote[]; total: number }>();
  for (const note of notes) {
    const s = scoreNote(note);
    if (!s) continue;
    const cur = byYm.get(s.ym) ?? { scored: [], total: 0 };
    cur.total += 1;
    if (s.total >= MIN_SCORE) cur.scored.push(s);
    byYm.set(s.ym, cur);
  }

  const months: BestNotesMonth[] = [];
  for (const [ym, v] of byYm) {
    if (v.scored.length < MIN_NOTES_PER_MONTH) continue;
    const ranked = [...v.scored].sort(
      (a, b) => b.total - a.total || a.note.createdAt.localeCompare(b.note.createdAt),
    );
    /* 한 사람이 그 달을 독식하지 않도록 작성자당 상한을 둔다. 상한을 둔다는
       사실도 페이지에 적는다 — 조용히 걸러내면 순위가 이상해 보인다. */
    const perAuthor = new Map<string, number>();
    const picks: ScoredNote[] = [];
    for (const s of ranked) {
      if (picks.length >= MAX_NOTES_PER_MONTH) break;
      const key = s.note.authorEmail.toLowerCase();
      const used = perAuthor.get(key) ?? 0;
      if (used >= MAX_PER_AUTHOR) continue;
      perAuthor.set(key, used + 1);
      picks.push(s);
    }
    months.push({ ym, qualifiedCount: v.scored.length, totalCount: v.total, picks });
  }

  return months.sort((a, b) => b.ym.localeCompare(a.ym));
}

/** 특정 달. 없으면 null (없는 달의 "이달의 노트"를 만들지 않는다). */
export async function getBestNotesMonth(ym: string): Promise<BestNotesMonth | null> {
  if (!/^\d{6}$/.test(ym)) return null;
  const months = await listBestNoteMonths();
  return months.find((m) => m.ym === ym) ?? null;
}

export function formatYmKo(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`;
}
