/**
 * 임장노트 → 카드 덱(매거진 레이아웃) 구성기.
 *
 * 무엇을 하는가 — 이미 저장된 노트(사용자가 쓴 글·사진·체크·점수)와 이미 저장된
 * AI 분석(`inspection_notes.ai_analysis`)을 읽어서 "몇 장짜리 카드"로 나눈다.
 * 화면은 서버 렌더 HTML/CSS 로 그린다.
 *
 * 무엇을 하지 않는가 — 여기서 문장을 지어내지 않는다. 이 파일이 만드는 한국어는
 * 페이지 제목 같은 UI 라벨뿐이고, 본문에 들어가는 문장은 전부 노트 원문이나
 * 저장된 AI 분석에서 그대로 가져온다. 렌더 시점에 LLM 을 호출하지 않는다
 * (호출당 비용·지연이 생기고, 볼 때마다 결과가 달라져 "내 노트"가 아니게 된다).
 *
 * 장수 정책 — 구독 플랜이 상한을 정한다.
 *   FREE 5~7장 · PRO 10~14장 · EXPERT 15장 이상.
 * 다만 **내용이 없으면 장수를 채우지 않는다.** 사진 두 장짜리 노트를 15장으로
 * 불리려면 없는 말을 지어내야 하고, 그건 이 제품이 하지 않기로 한 일이다.
 * 대신 "지금 만들 수 있는 건 N장, 무엇을 더하면 늘어난다"를 그대로 알려준다
 * (`shortOf`, `growthHints`).
 */

import { readStoredDeepDive } from "@/lib/inspection/deep-dive-view";
import { planLabel } from "@/lib/subscriptions/labels";
import type {
  InspectionChecklistItem,
  InspectionNote,
  InspectionScores,
} from "@/lib/inspection/store-db";

/* ─────────────────────────────── 타입 ─────────────────────────────── */

/** 덱 장수 상한을 정하는 플랜 티어 (`lib/subscriptions/access-gate` 와 같은 어휘). */
export type DeckPlan = "free" | "pro" | "expert" | "enterprise";

/** 카드 배경 프리셋 — 연속으로 같은 톤이 오지 않게 배치한다. */
export type DeckTheme = "cover" | "light" | "tint" | "ink" | "photo";

export type DeckPageKind =
  | "cover"
  | "verdict"
  | "score"
  | "pros"
  | "cons"
  | "checklist"
  | "risks"
  | "followups"
  | "keywords"
  | "deepdive"
  | "section"
  | "memo"
  | "photo"
  | "closing";

/** 본문 한 줄의 출처 — 카드 하단 각주로 그대로 노출한다. */
export type DeckSource =
  | "노트 원문"
  | "AI 분석"
  | "심화 분석"
  | "체크리스트"
  | "사진"
  | "방문 기록";

export type DeckPage = {
  /** React key 및 앵커용 안정 id */
  id: string;
  kind: DeckPageKind;
  theme: DeckTheme;
  /** 카드 상단 작은 라벨 */
  eyebrow: string;
  title: string;
  /** 문단 본문 */
  body: string[];
  /** 불릿 본문 */
  bullets: string[];
  /** 사진 URL (photo·cover 카드) */
  photo: string | null;
  /** 점수 카드 전용 */
  scores: { label: string; value: number; max: number }[];
  /** 체크리스트 카드 전용 */
  checks: { label: string; done: boolean }[];
  /** 키워드 카드 전용 */
  chips: string[];
  source: DeckSource;
};

export type NoteDeck = {
  noteId: string;
  plan: DeckPlan;
  planLabel: string;
  /** 이 플랜의 장수 구간 */
  range: { min: number; max: number; label: string };
  pages: DeckPage[];
  /** 내용으로 만들 수 있었던 총 장수(상한 적용 전) */
  available: number;
  /** 상한 때문에 잘라낸 장수 — 상위 플랜에서 더 볼 수 있는 분량 */
  trimmed: number;
  /** 플랜 최소 장수에 못 미친 장수 (내용 부족). 0 이면 부족하지 않다. */
  shortOf: number;
  /** 장수를 늘리려면 무엇을 더하면 되는지 — 실제로 비어 있는 항목만 담는다. */
  growthHints: string[];
  /** 저장된 AI 분석이 있었는지 */
  hasAiReport: boolean;
};

/* ───────────────────────── 플랜별 장수 구간 ───────────────────────── */

/**
 * 오너 지정: "구독모델에 따라 5-7장 / 10장 이상 / 15장 이상".
 * PRO 상한을 14로 둔 이유 — "10장 이상"과 "15장 이상"이 실제로 구분되려면
 * PRO 가 15장을 넘지 않아야 한다. 상한은 콘텐츠가 아무리 많아도 넘지 않는다.
 */
export const DECK_PLAN_RANGE: Record<DeckPlan, { min: number; max: number; label: string }> = {
  free: { min: 5, max: 7, label: "5~7장" },
  pro: { min: 10, max: 14, label: "10장 이상" },
  expert: { min: 15, max: 24, label: "15장 이상" },
  enterprise: { min: 15, max: 24, label: "15장 이상" },
};

/* 여기만 영문(FREE/PRO/EXPERT)이라, 같은 사용자가 요금제에서 "플러스"를 사고
   노트 덱에서는 "PRO"를 봤다. 단일 출처로 통일. */

/** 문자열(세션·DB) → 덱 플랜. 모르는 값은 가장 낮은 티어로 떨어뜨린다. */
export function normalizeDeckPlan(raw: string | null | undefined): DeckPlan {
  const s = (raw ?? "").toLowerCase().trim();
  if (s === "enterprise") return "enterprise";
  if (s === "expert") return "expert";
  if (s === "pro") return "pro";
  return "free";
}

/* ─────────────────────── 저장된 AI 분석 읽기 ─────────────────────── */

/**
 * 덱이 쓰는 만큼의 AI 분석 조각.
 * `mergeInspectionReportIntoAnalysis` 가 `ai_analysis.inspectionReport` 에 원본을
 * 넣고 상위 키에도 펼쳐 두므로, 둘 다 읽되 원본을 먼저 본다.
 */
export type DeckAiReport = {
  headline: string;
  summary: string;
  verdict: string;
  strengths: string[];
  risks: string[];
  followUps: string[];
  keywords: string[];
};

function str(v: unknown, max = 400): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

function strList(v: unknown, maxItems = 6, max = 160): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, max);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function firstNonEmpty(...values: string[]): string {
  for (const v of values) if (v) return v;
  return "";
}

function firstNonEmptyList(...values: string[][]): string[] {
  for (const v of values) if (v.length > 0) return v;
  return [];
}

/** `ai_analysis` jsonb → 덱용 조각. 쓸 만한 내용이 하나도 없으면 null. */
export function readDeckAiReport(analysis: Record<string, unknown> | null): DeckAiReport | null {
  if (!analysis) return null;
  const nested =
    analysis.inspectionReport && typeof analysis.inspectionReport === "object"
      ? (analysis.inspectionReport as Record<string, unknown>)
      : {};

  const report: DeckAiReport = {
    headline: firstNonEmpty(str(nested.headline, 120), str(analysis.headline, 120)),
    summary: firstNonEmpty(
      str(nested.summary, 600),
      str(analysis.narrativeSummary, 600),
      str(analysis.summary, 600),
    ),
    verdict: firstNonEmpty(
      str(nested.verdict, 400),
      str(analysis.detailedConclusion, 400),
      str(analysis.llmDetailedConclusion, 400),
    ),
    strengths: firstNonEmptyList(strList(nested.strengths), strList(analysis.strengths)),
    risks: firstNonEmptyList(
      strList(nested.risks),
      strList(analysis.weaknesses),
      strList(analysis.riskFlags),
    ),
    followUps: firstNonEmptyList(strList(nested.followUps), strList(analysis.recommendations)),
    keywords: firstNonEmptyList(strList(nested.keywords, 8, 40), strList(analysis.keywords, 8, 40)),
  };

  const hasAnything =
    report.headline ||
    report.summary ||
    report.verdict ||
    report.strengths.length ||
    report.risks.length ||
    report.followUps.length ||
    report.keywords.length;

  return hasAnything ? report : null;
}

/* ─────────────────────── 심화 분석(8축) 읽기 ───────────────────────
   `lib/inspection/deep-dive.ts` 가 **조회한 데이터로** 만들어
   `ai_analysis.deepDive` 에 저장해 둔 결과를 그대로 읽는다. 여기서 축을 새로
   만들거나 문장을 보태지 않는다 — 이 파일이 하는 일은 저장된 것을 카드로
   나누는 것뿐이다.

   status 가 `unavailable` 인 축(= 자료를 확인하지 못한 축)은 카드로 만들지
   않는다. "확인하지 못했습니다" 한 줄로 장수를 채우는 것은 내용 없이 장수를
   불리는 것과 같기 때문이다. 다만 **그 사유를 지우지는 않는다** — 노트 상세
   화면은 8축을 전부, 못 읽은 이유까지 그대로 보여준다. */

export type DeckDeepDiveAxis = {
  id: string;
  label: string;
  eyebrow: string;
  headline: string;
  bullets: string[];
  /** "라벨 값" 한 줄로 합친 근거 수치 — 카드에서는 칩으로 그린다. */
  facts: string[];
  /** LLM 이 붙인 해석 한 줄(없을 수 있다). 숫자는 여기 들어오지 않는다. */
  insight: string;
  /** 일부만 확인된 축이면 무엇을 못 읽었는지 */
  note: string;
};

/** `ai_analysis.deepDive` → 덱 카드로 만들 수 있는 축만. 없으면 빈 배열. */
export function readDeckDeepDive(analysis: Record<string, unknown> | null): DeckDeepDiveAxis[] {
  const stored = readStoredDeepDive(analysis);
  if (!stored) return [];
  const out: DeckDeepDiveAxis[] = [];

  for (const sec of stored.sections) {
    if (sec.status === "unavailable") continue;
    const bullets = sec.bullets;
    const facts = sec.facts.map((f) => `${f.label} ${f.value}`);
    /* 본문도 수치도 없는 축은 카드가 되지 못한다. */
    if (bullets.length === 0 && facts.length === 0) continue;
    out.push({
      id: sec.id,
      label: sec.label,
      eyebrow: sec.eyebrow,
      headline: sec.headline,
      bullets,
      facts,
      insight: sec.insight,
      note: sec.status === "partial" ? sec.note : "",
    });
  }
  return out;
}

/**
 * 플랜별로 **덱에 실을** 심화 분석 축 수.
 * 8축을 전부 앞에 밀어 넣으면 FREE 덱은 상한(7장)에 걸려 사용자가 직접 쓴
 * 글이 통째로 잘려 나간다 — 내 노트를 보러 왔는데 AI 분석만 남는 덱이 된다.
 * 그래서 낮은 플랜일수록 적게 싣는다. 축 자체는 플랜과 무관하게 전부
 * 만들어지고 노트 상세 화면에서는 8축이 그대로 보인다. 여기서 정하는 것은
 * "덱 카드로 몇 장을 뽑을지"뿐이다.
 */
const DEEP_DIVE_CARD_LIMIT: Record<DeckPlan, number> = {
  free: 1,
  pro: 4,
  expert: 8,
  enterprise: 8,
};

/* ───────────────────────────── 구성 ───────────────────────────── */

const SCORE_AXES: { key: keyof InspectionScores; label: string }[] = [
  { key: "location", label: "입지" },
  { key: "school", label: "학군" },
  { key: "transport", label: "교통" },
  { key: "facility", label: "시설" },
  { key: "future", label: "미래가치" },
];

/** 작성 폼이 평가하지 않은 축은 0 으로 저장된다 — 0 을 "최하점"으로 그리면 거짓말이 된다. */
function ratedAxes(scores: InspectionScores) {
  return SCORE_AXES.filter((a) => Number(scores[a.key]) > 0).map((a) => ({
    label: a.label,
    value: Number(scores[a.key]),
    max: 5,
  }));
}

/** 자유서술 섹션을 문단 배열로. 빈 줄 기준으로 자른다. */
function paragraphs(text: string | undefined | null, maxParas = 4): string[] {
  const s = (text ?? "").trim();
  if (!s) return [];
  return s
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, maxParas);
}

/** 줄 단위 목록(장점·단점 칩이 개행으로 저장된다). */
function lines(text: string | undefined | null, maxItems = 6): string[] {
  const s = (text ?? "").trim();
  if (!s) return [];
  return s
    .split(/[\n·,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function blankPage(over: Partial<DeckPage> & { id: string; kind: DeckPageKind }): DeckPage {
  return {
    theme: "light",
    eyebrow: "",
    title: "",
    body: [],
    bullets: [],
    photo: null,
    scores: [],
    checks: [],
    chips: [],
    source: "노트 원문",
    ...over,
  };
}

/** 사진 카드는 원문 캡션이 없으므로 사진만 크게 보여준다(설명을 지어내지 않는다). */
function photoPage(url: string, i: number, total: number): DeckPage {
  return blankPage({
    id: `photo-${i}`,
    kind: "photo",
    theme: "photo",
    eyebrow: `현장 사진 ${i}/${total}`,
    title: "",
    photo: url,
    source: "사진",
  });
}

function checklistSummary(checklist: InspectionChecklistItem[]) {
  const done = checklist.filter((c) => c.done).length;
  return { done, total: checklist.length };
}

export type BuildDeckInput = {
  note: InspectionNote;
  /** 노트 작성자의 구독 플랜 — 보는 사람이 아니라 **쓴 사람**의 플랜이 장수를 정한다. */
  plan: DeckPlan;
};

export function buildNoteDeck({ note, plan }: BuildDeckInput): NoteDeck {
  const range = DECK_PLAN_RANGE[plan];
  const ai = readDeckAiReport(note.aiAnalysis);
  const photos = note.photos.filter((p) => typeof p === "string" && p.trim().length > 0);
  const axes = ratedAxes(note.scores);
  const check = checklistSummary(note.checklist);

  /* ── 표지 ───────────────────────────────────────────────────────── */
  const placeLine = [note.region, note.aptName].filter(Boolean).join(" · ");
  const cover = blankPage({
    id: "cover",
    kind: "cover",
    theme: "cover",
    eyebrow: placeLine,
    title: note.title,
    body: [`${note.visitDate} 방문`],
    photo: photos[0] ?? null,
    source: "방문 기록",
  });

  /* ── 본문 후보 (앞에 올수록 먼저 살아남는다) ───────────────────── */
  const content: DeckPage[] = [];

  /* 심화 분석 카드 — 저장된 8축 중 실제로 내용이 있는 축만 카드가 된다.
     한 장은 총평 바로 뒤에 두고(어느 플랜이든 최소 한 축은 보이도록),
     나머지는 사용자가 쓴 글 뒤에 붙인다. AI 축이 앞을 다 차지해 정작
     본인이 쓴 문장이 잘려 나가면 그건 "내 노트"가 아니다. */
  const deepDiveCards = readDeckDeepDive(note.aiAnalysis)
    .slice(0, DEEP_DIVE_CARD_LIMIT[plan])
    .map((axis, i) => {
      /* 카드 한 장에 들어가는 양은 정해져 있다. 넘치는 만큼은 **잘렸다고
         적는다** — 카드가 잘린 것을 사용자는 "그게 전부"로 읽는다. */
      const bullets = axis.bullets.slice(0, 3);
      const facts = axis.facts.slice(0, 3);
      const over = axis.bullets.length - bullets.length + (axis.facts.length - facts.length);
      const body = [axis.headline, axis.insight, axis.note].filter(Boolean);
      if (over > 0) body.push(`이 축의 나머지 근거 ${over}개는 노트 상세에서 볼 수 있어요`);
      return blankPage({
        id: `deepdive-${axis.id}`,
        kind: "deepdive",
        theme: i % 2 === 0 ? "light" : "tint",
        eyebrow: `심화 분석 · ${axis.eyebrow}`,
        title: axis.label,
        body,
        bullets,
        chips: facts,
        source: "심화 분석",
      });
    });

  if (ai && (ai.headline || ai.summary || ai.verdict)) {
    content.push(
      blankPage({
        id: "verdict",
        kind: "verdict",
        theme: "ink",
        eyebrow: "AI 총평",
        title: ai.headline || "AI 가 읽은 이 노트",
        body: [ai.summary, ai.verdict].filter(Boolean),
        source: "AI 분석",
      }),
    );
  }

  content.push(...deepDiveCards.slice(0, 1));

  if (axes.length >= 2) {
    const avg = axes.reduce((a, x) => a + x.value, 0) / axes.length;
    content.push(
      blankPage({
        id: "score",
        kind: "score",
        theme: "tint",
        eyebrow: "직접 매긴 점수",
        title: `평균 ${avg.toFixed(1)} / 5`,
        scores: axes,
        source: "노트 원문",
      }),
    );
  }

  const pros = firstNonEmptyList(lines(note.sections.pros), ai ? ai.strengths : []);
  if (pros.length > 0) {
    content.push(
      blankPage({
        id: "pros",
        kind: "pros",
        theme: "light",
        eyebrow: "좋았던 점",
        title: "여기가 마음에 들었어요",
        bullets: pros,
        source: note.sections.pros?.trim() ? "노트 원문" : "AI 분석",
      }),
    );
  }

  const cons = firstNonEmptyList(lines(note.sections.cons), ai ? ai.risks : []);
  if (cons.length > 0) {
    content.push(
      blankPage({
        id: "cons",
        kind: "cons",
        theme: "tint",
        eyebrow: "아쉬웠던 점",
        title: "이건 걸렸어요",
        bullets: cons,
        source: note.sections.cons?.trim() ? "노트 원문" : "AI 분석",
      }),
    );
  }

  if (check.total > 0) {
    /* 카드 한 장에 12줄은 들어가지 않는다. 8개만 싣되 **나머지를 숨기지 않고**
       몇 건이 더 있는지 적는다 — 잘린 것을 없는 것처럼 보이게 하지 않는다. */
    const shown = note.checklist
      .slice(0, 8)
      .map((c) => ({ label: str(c.label, 46), done: c.done }));
    content.push(
      blankPage({
        id: "checklist",
        kind: "checklist",
        theme: "light",
        eyebrow: "현장 체크",
        title: `${check.total}개 중 ${check.done}개 확인`,
        body: check.total > shown.length ? [`이 카드에는 ${shown.length}개만 보여요 · 전체는 원문에서`] : [],
        checks: shown,
        source: "체크리스트",
      }),
    );
  }

  if (note.summary?.trim()) {
    content.push(
      blankPage({
        id: "summary",
        kind: "memo",
        theme: "ink",
        eyebrow: "한 줄 요약",
        title: "다녀와서 남긴 말",
        body: paragraphs(note.summary, 3),
        source: "노트 원문",
      }),
    );
  }

  content.push(...deepDiveCards.slice(1));

  if (ai && ai.risks.length > 0 && !note.sections.cons?.trim()) {
    // 원문 단점 카드가 없을 때만 — 같은 내용을 두 장으로 만들지 않는다.
    content.push(
      blankPage({
        id: "risks",
        kind: "risks",
        theme: "tint",
        eyebrow: "AI 가 짚은 리스크",
        title: "확인하고 넘어가세요",
        bullets: ai.risks,
        source: "AI 분석",
      }),
    );
  }

  if (ai && ai.followUps.length > 0) {
    content.push(
      blankPage({
        id: "followups",
        kind: "followups",
        theme: "light",
        eyebrow: "다음에 할 일",
        title: "이건 아직 안 봤어요",
        bullets: ai.followUps,
        source: "AI 분석",
      }),
    );
  }

  const SECTION_CARDS: { key: keyof typeof note.sections; eyebrow: string; title: string }[] = [
    { key: "location", eyebrow: "입지", title: "동네를 걸어보니" },
    { key: "transport", eyebrow: "교통", title: "오가는 길은" },
    { key: "school", eyebrow: "학군", title: "학교와 학원은" },
    { key: "facility", eyebrow: "시설", title: "단지와 집 상태는" },
    { key: "future", eyebrow: "미래가치", title: "앞으로는" },
  ];
  for (const sec of SECTION_CARDS) {
    const paras = paragraphs(note.sections[sec.key], 3);
    if (paras.length === 0) continue;
    content.push(
      blankPage({
        id: `section-${String(sec.key)}`,
        kind: "section",
        theme: "light",
        eyebrow: sec.eyebrow,
        title: sec.title,
        body: paras,
        source: "노트 원문",
      }),
    );
  }

  const memo = paragraphs(note.sections.memo, 3);
  if (memo.length > 0) {
    content.push(
      blankPage({
        id: "memo",
        kind: "memo",
        theme: "tint",
        eyebrow: "메모",
        title: "그밖에 적어둔 것",
        body: memo,
        source: "노트 원문",
      }),
    );
  }

  if (ai && ai.keywords.length > 0) {
    content.push(
      blankPage({
        id: "keywords",
        kind: "keywords",
        theme: "ink",
        eyebrow: "이 노트의 키워드",
        title: "",
        chips: ai.keywords,
        source: "AI 분석",
      }),
    );
  }

  /* ── 사진을 본문 사이에 끼워 넣는다 ─────────────────────────────
     표지에 쓴 첫 장은 빼고, 본문 두 장마다 한 장씩. 사진만 몰아 두면
     뒷부분이 통째로 잘려 나가 사진이 한 장도 안 보이는 덱이 된다. */
  const restPhotos = photos.slice(1, 11);
  const photoPages = restPhotos.map((url, i) => photoPage(url, i + 1, restPhotos.length));

  const woven: DeckPage[] = [];
  let pi = 0;
  content.forEach((page, i) => {
    woven.push(page);
    if ((i + 1) % 2 === 0 && pi < photoPages.length) woven.push(photoPages[pi++]);
  });
  while (pi < photoPages.length) woven.push(photoPages[pi++]);

  /* ── 맺음 ───────────────────────────────────────────────────────── */
  const author = note.authorLabel?.trim() || note.authorEmail.split("@")[0];
  const closing = blankPage({
    id: "closing",
    kind: "closing",
    theme: "cover",
    eyebrow: "내집나우 임장노트",
    title: placeLine || note.title,
    body: [`${author} · ${note.visitDate} 방문`],
    source: "방문 기록",
  });

  const all = [cover, ...woven, closing];
  const available = all.length;

  /* 상한 적용 — 맺음 장은 항상 마지막에 남긴다. */
  let pages: DeckPage[];
  if (available <= range.max) {
    pages = all;
  } else {
    pages = [...all.slice(0, range.max - 1), closing];
  }

  const trimmed = available - pages.length;
  const shortOf = Math.max(0, range.min - pages.length);

  /* 장수를 늘리는 방법 — 실제로 비어 있는 것만 말한다(빈 제안 금지). */
  const growthHints: string[] = [];
  if (shortOf > 0) {
    if (photos.length < 4) growthHints.push("현장 사진 추가하기");
    if (!ai) growthHints.push("AI 분석 실행하기");
    if (SECTION_CARDS.every((s) => !note.sections[s.key]?.trim())) {
      growthHints.push("입지·교통·학군 메모 채우기");
    }
    if (check.total === 0) growthHints.push("체크리스트 항목 확인하기");
    if (!note.summary?.trim()) growthHints.push("한 줄 요약 쓰기");
  }

  return {
    noteId: note.id,
    plan,
    planLabel: planLabel(plan),
    range,
    pages,
    available,
    trimmed,
    shortOf,
    growthHints,
    hasAiReport: Boolean(ai),
  };
}
