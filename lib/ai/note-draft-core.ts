import type { LiveToolContext } from "@/lib/ai/live-context";

/* ============================================================
   [944 · AI 대개편] 임장노트 AI 초안 — "쓰기 전에 절반을 채워 준다".

   원칙 (이 파일의 모든 판단 기준):
   1. 근거는 서버가 모은 실데이터(LiveToolContext)뿐이다. LLM 은 그 근거를
      구조화·서술할 뿐, 근거에 없는 수치를 지어내면 안 된다(프롬프트로 강제).
   2. 점수(현장 감각 9축 + 종합 만족도)는 **데이터 기반 추정**으로만 제안하고,
      화면·저장 메타에 "AI 추정 · 현장 확인 전" 라벨이 반드시 따라간다
      (소유자 결정 2026-09-01: 점수도 제안하되 추정 라벨).
   3. LLM 실패 시 rule 폴백 — 구조·데이터 근거·확인 포인트는 채우되, 점수는
      제안하지 않는다(근거 서술 없이 숫자만 내는 것은 지어낸 값이다).
   ============================================================ */

export type NoteDraftInput = {
  regionName: string;
  aptName?: string | null;
  complexId?: string | null;
  /** 방문 목적 — 실거주/투자/전월세/갈아타기 (자유 문자열 허용) */
  purpose?: string | null;
  /** 사용자가 미리 적은 한두 줄 메모 — 초안이 이를 반영하되 덮지 않는다 */
  userMemo?: string | null;
};

export const DRAFT_CHECK_AXES = [
  "채광", "소음", "주차", "교통", "경사", "보안", "학군", "관리", "호재",
] as const;
export type DraftLevel = "좋음" | "보통" | "아쉬움";

export type NoteDraft = {
  title: string;
  summary: string;
  /** 본문 초안(마크다운 아님 — 노트 메모 필드용 일반 텍스트) */
  memo: string;
  /** 9축 추정 — 근거가 있는 축만. rule 폴백에서는 항상 {} */
  checks: Partial<Record<(typeof DRAFT_CHECK_AXES)[number], DraftLevel>>;
  /** 종합 만족도 0~10 추정 — rule 폴백에서는 null */
  satisfaction: number | null;
  /** 점수 추정의 한 줄 근거 — 점수가 있으면 반드시 함께 */
  scoreRationale: string | null;
  /** 현장 확인 포인트(고려사항 목록으로 들어감) */
  todo: string[];
  /** 서버가 모은 데이터 근거 줄들 — 시점 포함, 그대로 화면·본문에 노출 */
  evidence: string[];
  llmUsed: boolean;
  model: string | null;
};

const fmtManwon = (krw: number): string => {
  const eok = krw / 100_000_000;
  return eok >= 1 ? `${eok.toFixed(1).replace(/\.0$/, "")}억` : `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만원`;
};
const ym = (v: string | null | undefined): string =>
  v && /^\d{6}/.test(v) ? `${v.slice(0, 4)}.${v.slice(4, 6)}` : (v ?? "");

/** LiveToolContext → 사람이 읽는 근거 줄. 값이 없는 축은 줄을 만들지 않는다. */
export function evidenceLinesFromContext(ctx: LiveToolContext): string[] {
  const out: string[] = [];
  if (ctx.complex?.price) {
    const p = ctx.complex.price;
    out.push(`이 단지 최근 실거래 평균 ${fmtManwon(p.priceKrw)} (${ym(p.latestYm)} 기준, ${p.bandLabel})`);
  }
  const snap = ctx.region?.snapshot;
  if (snap) {
    const parts: string[] = [];
    if (snap.avgSale != null && snap.avgSale > 0) parts.push(`평균 매매 ${fmtManwon(snap.avgSale)}`);
    if (snap.saleChangeMonthly != null) parts.push(`전월 대비 ${snap.saleChangeMonthly > 0 ? "+" : ""}${snap.saleChangeMonthly}%`);
    if (snap.jeonseRatio != null) parts.push(`전세가율 ${Math.round(snap.jeonseRatio)}%`);
    if (snap.tradeCount != null) parts.push(`월 거래 ${snap.tradeCount}건`);
    if (parts.length > 0) out.push(`${ctx.region?.name} ${parts.join(" · ")} (${ym(snap.period)} 한국부동산원)`);
  }
  if (ctx.rent && ctx.rent.wolseSharePct != null) {
    out.push(`전월세 신고 중 월세 비중 ${ctx.rent.wolseSharePct}% (최근 ${ctx.rent.months}개월)`);
  }
  if (ctx.supply && ctx.supply.upcomingComplexes > 0) {
    out.push(`입주 예정 ${ctx.supply.upcomingComplexes}개 단지 · ${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대 (청약홈 공고)`);
  }
  const demo = ctx.region?.demographics;
  if (demo && demo.unsoldUnits != null && demo.unsoldUnits > 0) {
    out.push(`미분양 ${demo.unsoldUnits.toLocaleString("ko-KR")}호 (${ym(demo.period)})`);
  }
  if (ctx.macro?.baseRatePct != null) {
    out.push(`기준금리 ${ctx.macro.baseRatePct}% (한국은행)`);
  }
  if (ctx.notes && ctx.notes.count > 0) {
    out.push(`이웃 임장노트 ${ctx.notes.count}건${ctx.notes.avgScore != null ? ` · 평균 ${ctx.notes.avgScore}/5` : ""}`);
  }
  if (ctx.poi && ctx.poi.schoolCount > 0) {
    out.push(`도보권 학교 ${ctx.poi.schoolCount}곳 (표준데이터)`);
  }
  for (const n of ctx.news?.items?.slice(0, 2) ?? []) {
    out.push(`최근 소식: ${n.title}`);
  }
  return out;
}

/** 데이터 조건부 확인 포인트 — 근거 줄과 같은 데이터에서만 유도한다. */
export function conditionalTodos(ctx: LiveToolContext): string[] {
  const t: string[] = [];
  const snap = ctx.region?.snapshot;
  if (snap?.jeonseRatio != null && snap.jeonseRatio >= 70) {
    t.push(`전세가율 ${Math.round(snap.jeonseRatio)}% — 갭·역전세 리스크와 전세 시세 확인`);
  }
  if (snap?.saleChangeMonthly != null && snap.saleChangeMonthly <= -1) {
    t.push(`전월 대비 ${snap.saleChangeMonthly}% 하락 — 급매·호가 괴리 확인`);
  }
  if (ctx.supply && ctx.supply.upcomingHouseholds >= 500) {
    t.push(`인근 입주 예정 ${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대 — 전세 공급 영향 확인`);
  }
  const demo = ctx.region?.demographics;
  if (demo?.unsoldUnits != null && demo.unsoldUnits >= 100) {
    t.push(`미분양 ${demo.unsoldUnits.toLocaleString("ko-KR")}호 — 신축 할인·분양가 비교`);
  }
  return t;
}

const BASE_TODOS = [
  "낮·밤 두 번 방문해 소음·주차 상태 비교",
  "관리사무소에 관리비 평균·수선충당금 확인",
  "가장 가까운 초등학교 통학로 직접 걷기",
  "지하철역·버스정류장까지 실제 도보 시간 측정",
];

function draftTitle(input: NoteDraftInput): string {
  const d = new Date();
  const dateLabel = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const target = input.aptName?.trim() || input.regionName.trim();
  return `${target} 임장노트 (${dateLabel})`;
}

/** LLM 없이 만드는 구조 초안 — 점수는 제안하지 않는다. */
export function ruleDraft(input: NoteDraftInput, ctx: LiveToolContext): NoteDraft {
  const evidence = evidenceLinesFromContext(ctx);
  const todo = [...conditionalTodos(ctx), ...BASE_TODOS].slice(0, 8);
  const target = input.aptName?.trim() || input.regionName.trim();
  const memoParts = [
    input.purpose ? `방문 목적: ${input.purpose}` : null,
    input.userMemo?.trim() ? `사전 메모: ${input.userMemo.trim()}` : null,
    evidence.length > 0
      ? `\n[데이터 근거 — 자동 수집]\n${evidence.map((e) => `· ${e}`).join("\n")}`
      : null,
    `\n[현장에서 확인할 것]\n${todo.map((e) => `· ${e}`).join("\n")}`,
  ].filter(Boolean);
  return {
    title: draftTitle(input),
    summary: `${target} 방문 전 데이터 예습 초안 — 현장 확인 후 채워 넣기`,
    memo: memoParts.join("\n"),
    checks: {},
    satisfaction: null,
    scoreRationale: null,
    todo,
    evidence,
    llmUsed: false,
    model: null,
  };
}

export const DRAFT_SCHEMA = {
  name: "note_draft",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      summary: { type: "string", description: "한 줄 요약 (80자 이내)" },
      memo: { type: "string", description: "임장노트 본문 초안. 데이터 근거 섹션과 현장 확인 섹션 포함. 일반 텍스트." },
      checks: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          DRAFT_CHECK_AXES.map((a) => [
            a,
            { type: ["string", "null"], enum: ["좋음", "보통", "아쉬움", null] },
          ]),
        ),
        required: [...DRAFT_CHECK_AXES],
      },
      satisfaction: { type: ["number", "null"], description: "0~10 종합 만족도 추정. 근거 부족 시 null" },
      score_rationale: { type: ["string", "null"], description: "점수 추정의 근거 한두 문장. 점수를 냈다면 필수" },
      todo: { type: "array", items: { type: "string" }, description: "현장 확인 포인트 4~8개" },
    },
    required: ["title", "summary", "memo", "checks", "satisfaction", "score_rationale", "todo"],
  },
} as const;

