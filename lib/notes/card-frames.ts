/**
 * 임장노트 카드 프레임 카탈로그 — "카드에 들어갈 장" 13종. **순수 로직(테스트 가능).**
 *
 * 사용자가 이 중 최소 5장을 골라 자기 카드를 구성한다. 각 프레임은:
 *  - `available(source)` : 그 노트에 이 장을 채울 데이터가 있는가(없으면 후보에서 뺀다)
 *  - `build(source)`     : 노트 데이터 → 프레임 콘텐츠(제목·줄·통계). **숫자를 만들지
 *                          않는다** — source 에 있는 값만 옮긴다(사실 우선).
 *
 * 렌더(satori)와 빌더 미리보기(HTML)가 같은 build() 결과를 그린다 — 콘텐츠 로직을
 * 두 곳에 두지 않기 위함. 프레임은 DB 행이 아니라 NoteCardSource(아래) 를 받는다 —
 * 노트 스키마가 바뀌어도 어댑터(toCardSource) 한 곳만 고치면 된다.
 */

/** 프레임이 소비하는 노트 요약 — DB 행에서 어댑터가 채운다(card-source.ts). */
export type NoteCardSource = {
  title: string;
  aptName: string | null;
  region: string | null;
  visitLabel: string | null; // "2026.08 방문"
  verdict: string | null; // 한줄 판정
  intent: string | null; // 목적(실거주/투자…)
  budgetLabel: string | null;
  summary: string | null;
  risks: string | null;
  weather: string | null;
  transportation: string | null;
  /** 5축 점수(0~100), 없으면 null */
  scores: { label: string; value: number | null }[];
  /** 현장 체크(채광/소음/주차…) — rating: "좋음"|"보통"|"아쉬움" 등 */
  checks: { label: string; rating: string }[];
  pros: string[];
  cons: string[];
  tags: string[];
  hasLocation: boolean;
};

export type FrameCategory = "표지" | "요약" | "점수" | "현장" | "판단" | "마무리";

export type FrameContent =
  | { kind: "cover"; apt: string; region: string; visit: string | null; verdict: string | null }
  | { kind: "scoreRing"; score: number; grade: string }
  | { kind: "scoreBars"; bars: { label: string; value: number }[] }
  | { kind: "summary"; heading: string; body: string }
  | { kind: "checklist"; items: { label: string; rating: string; tone: "good" | "mid" | "bad" }[] }
  | { kind: "list"; heading: string; items: string[]; tone: "pos" | "neg" }
  | { kind: "context"; rows: { label: string; value: string }[] }
  | { kind: "tags"; heading: string; tags: string[] }
  | { kind: "cta"; heading: string; sub: string };

export type CardFrame = {
  id: string;
  label: string;
  category: FrameCategory;
  /** 표지 후보 여부 — 자동 구성 시 항상 첫 장으로 강제 */
  isCover?: boolean;
  available: (s: NoteCardSource) => boolean;
  build: (s: NoteCardSource) => FrameContent;
};

/* ── 헬퍼 ─────────────────────────────────────────────────────────── */

/** 5축 평균 점수(있는 값만). 없으면 null. */
export function averageScore(s: NoteCardSource): number | null {
  const vals = s.scores.map((x) => x.value).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function gradeOf(score: number): string {
  if (score >= 85) return "아주 좋음";
  if (score >= 70) return "좋음";
  if (score >= 55) return "무난";
  if (score >= 40) return "고민";
  return "아쉬움";
}

function checkTone(rating: string): "good" | "mid" | "bad" {
  const r = rating.trim();
  if (/(좋|상|만족|우수|넓|밝|조용)/.test(r)) return "good";
  if (/(아쉬|하|부족|불만|좁|어두|시끄)/.test(r)) return "bad";
  return "mid";
}

/* ── 프레임 13종 ──────────────────────────────────────────────────── */

export const CARD_FRAMES: readonly CardFrame[] = [
  {
    id: "cover",
    label: "표지",
    category: "표지",
    isCover: true,
    available: () => true,
    build: (s) => ({
      kind: "cover",
      apt: s.aptName || s.title || "임장 기록",
      region: s.region || "",
      visit: s.visitLabel,
      verdict: s.verdict,
    }),
  },
  {
    id: "score-ring",
    label: "종합 점수",
    category: "점수",
    available: (s) => averageScore(s) !== null,
    build: (s) => {
      const sc = averageScore(s) ?? 0;
      return { kind: "scoreRing", score: sc, grade: gradeOf(sc) };
    },
  },
  {
    id: "score-bars",
    label: "항목별 점수",
    category: "점수",
    available: (s) => s.scores.some((x) => typeof x.value === "number"),
    build: (s) => ({
      kind: "scoreBars",
      bars: s.scores
        .filter((x): x is { label: string; value: number } => typeof x.value === "number")
        .map((x) => ({ label: x.label, value: x.value })),
    }),
  },
  {
    id: "summary",
    label: "한 줄 요약",
    category: "요약",
    available: (s) => Boolean((s.summary ?? "").trim()),
    build: (s) => ({
      kind: "summary",
      heading: "요약",
      body: (s.summary ?? "").trim(),
    }),
  },
  {
    id: "verdict",
    label: "내 판정",
    category: "판단",
    available: (s) => Boolean((s.verdict ?? "").trim()),
    build: (s) => ({ kind: "summary", heading: "내 판정", body: (s.verdict ?? "").trim() }),
  },
  {
    id: "checklist",
    label: "현장 체크",
    category: "현장",
    available: (s) => s.checks.length > 0,
    build: (s) => ({
      kind: "checklist",
      items: s.checks.slice(0, 8).map((c) => ({
        label: c.label,
        rating: c.rating,
        tone: checkTone(c.rating),
      })),
    }),
  },
  {
    id: "pros",
    label: "좋았던 점",
    category: "판단",
    available: (s) => s.pros.length > 0,
    build: (s) => ({ kind: "list", heading: "좋았던 점", items: s.pros.slice(0, 5), tone: "pos" }),
  },
  {
    id: "cons",
    label: "아쉬운 점·리스크",
    category: "판단",
    available: (s) => s.cons.length > 0 || Boolean((s.risks ?? "").trim()),
    build: (s) => {
      const items = s.cons.length > 0 ? s.cons.slice(0, 5) : [(s.risks ?? "").trim()].filter(Boolean);
      return { kind: "list", heading: "아쉬운 점·리스크", items, tone: "neg" };
    },
  },
  {
    id: "intent",
    label: "목적·예산",
    category: "요약",
    available: (s) => Boolean(s.intent || s.budgetLabel),
    build: (s) => ({
      kind: "context",
      rows: [
        ...(s.intent ? [{ label: "목적", value: s.intent }] : []),
        ...(s.budgetLabel ? [{ label: "예산", value: s.budgetLabel }] : []),
      ],
    }),
  },
  {
    id: "visit-context",
    label: "방문 정보",
    category: "현장",
    available: (s) => Boolean(s.visitLabel || s.weather || s.transportation),
    build: (s) => ({
      kind: "context",
      rows: [
        ...(s.visitLabel ? [{ label: "방문", value: s.visitLabel }] : []),
        ...(s.weather ? [{ label: "날씨", value: s.weather }] : []),
        ...(s.transportation ? [{ label: "이동", value: s.transportation }] : []),
      ],
    }),
  },
  {
    id: "tags",
    label: "태그",
    category: "요약",
    available: (s) => s.tags.length > 0,
    build: (s) => ({ kind: "tags", heading: "이 집을 한마디로", tags: s.tags.slice(0, 6) }),
  },
  {
    id: "location",
    label: "위치",
    category: "현장",
    available: (s) => s.hasLocation,
    build: (s) => ({
      kind: "context",
      rows: [{ label: "위치", value: s.region || s.aptName || "지도 참조" }],
    }),
  },
  {
    id: "cta",
    label: "마무리",
    category: "마무리",
    available: () => true,
    build: () => ({
      kind: "cta",
      heading: "시세는 누구나 봅니다, 현장은 가 본 사람만 압니다",
      sub: "nuguzip.com",
    }),
  },
] as const;

export function getFrame(id: string): CardFrame | undefined {
  return CARD_FRAMES.find((f) => f.id === id);
}

/** 이 노트에서 채울 수 있는 프레임만 */
export function availableFrames(s: NoteCardSource): CardFrame[] {
  return CARD_FRAMES.filter((f) => f.available(s));
}
