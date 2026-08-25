import { AI_TOOL_IDS, CORE_AI_TOOL_IDS, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";

/* ============================================================
   분석 허브 카탈로그 — [UI-01·02·04·06] 단일 진실 소스.

   왜 이 파일이 생겼나(2026-08-25 실측 진단):
   - 허브 한 화면에 진입점이 23개였고 전부 같은 무게로 평평했다(UI-01).
   - 워크벤치 12종과 도구 카드 8종 사이에 **이름이 겹치는 쌍이 5개** 있었다
     (비교·포트폴리오·타이밍·갭·시나리오) — "어떤 게 어느 기능인지" 알 방법이
     없었던 직접 원인이다(UI-02). 이름에 **대상**(이 단지 / 지역 / 전국)을 넣어
     구분한다. 사용자는 기능 이름이 아니라 대상으로 고른다.
   - 실데이터 도구와 체험(시뮬레이션) 도구가 9px 칩 하나로만 구분됐다(UI-04)
     → 구역 자체를 나눈다.
   - 아이콘이 이모지(📝📈⏱…)라 기기마다 모양이 달랐다(UI-06) → 선형 Icon 세트.

   계열(tier)은 색과 아이콘 배경을 결정한다 — 색이 곧 분류다.
   ============================================================ */

export type TierId = "complex" | "market" | "record";

export interface TierMeta {
  id: TierId;
  /** 사용자가 스스로에게 묻는 문장 — 기능명이 아니라 목적으로 고르게 한다 */
  question: string;
  hint: string;
  /** 아이콘 배경·강조에 쓰는 토큰 클래스 (raw hex 금지 — 대비 게이트 통과 조건) */
  iconClass: string;
  /** 스파크라인 선 색 — currentColor 를 타고 들어간다 */
  sparkClass: string;
  /** 계열 한 줄 요약 배지 */
  badge: string;
}

export const TIERS: Record<TierId, TierMeta> = {
  complex: {
    id: "complex",
    question: "단지 하나를 깊게 보고 싶어요",
    hint: "단지명만 넣으면 실거래·전월세·공급·뉴스가 자동으로 붙습니다",
    iconClass: "bg-primary-soft text-primary",
    sparkClass: "text-primary",
    badge: "단지 1곳",
  },
  market: {
    id: "market",
    question: "지역·시장 흐름이 궁금해요",
    hint: "국토교통부 실거래와 공표 통계로 계산합니다",
    iconClass: "bg-success-soft text-success",
    sparkClass: "text-success",
    badge: "지역·전국",
  },
  record: {
    id: "record",
    question: "내가 쓴 기록을 정리하고 싶어요",
    hint: "임장노트를 점수화하고 후보를 나란히 비교합니다",
    iconClass: "bg-warning-soft text-warning",
    sparkClass: "text-warning",
    badge: "내 기록",
  },
};

export interface HubTool {
  href: string;
  title: string;
  desc: string;
  /** 선형 아이콘 이름 (app/components/Icon.tsx) — 이모지 금지 */
  icon: string;
  tier: TierId;
  /** 실데이터가 아니라 예시 계산이면 true → 별도 "체험" 구역으로 내려간다 */
  sim?: boolean;
  /** 티저 키 — hub-teasers 의 실측 숫자와 연결 (없으면 숫자 줄이 빠진다) */
  teaser?: "price" | "timing" | "temp" | "baseRate" | "gap" | "notes" | "compare";
}

/** 워크벤치(단지 1개 스코프) — 많이 쓰는 4개가 앞, 나머지는 접힌다(UI-03). */
export const WORKBENCH_CORE: readonly AiAnalysisToolId[] = CORE_AI_TOOL_IDS;
export const WORKBENCH_MORE: readonly AiAnalysisToolId[] = AI_TOOL_IDS.filter(
  (id) => !CORE_AI_TOOL_IDS.includes(id as (typeof CORE_AI_TOOL_IDS)[number]),
);

/** 워크벤치 12종의 허브용 아이콘 — TOOL_IDENTITIES 는 lucide 컴포넌트를 들고
 *  있어 서버 카드에서 바로 못 쓴다. 같은 뜻의 선형 아이콘 이름으로 잇는다. */
export const WORKBENCH_ICONS: Record<AiAnalysisToolId, string> = {
  "ai-diagnosis": "target",
  "ai-prediction": "trending-up",
  "ai-risk": "shield",
  "ai-compare": "scale",
  "ai-inspection": "compass",
  "my-checklist": "clipboard",
  "ai-portfolio": "briefcase",
  "ai-timing": "clock",
  "ai-simulator": "calculator",
  "ai-gap": "coin",
  "ai-economy": "bar",
  "contract-risk": "file-text",
};

export function workbenchCard(id: AiAnalysisToolId) {
  const t = TOOL_IDENTITIES[id];
  return {
    href: `/analysis/ai/${id}`,
    title: t.title,
    desc: t.tagline,
    icon: WORKBENCH_ICONS[id] ?? "sparkles",
  };
}

/* 지역·시장 / 내 기록 도구.
   [UI-02] 중복은 **워크벤치 쪽 이름에 대상("이 단지"·"내")을 넣어** 풀었다.
   그래서 여기 제목은 도착 페이지가 스스로 쓰는 이름을 그대로 쓴다 — 카드에서
   본 이름과 열린 화면의 이름이 다르면 그게 다시 "어떤 게 어느 기능인지"를
   흐린다. 대상(지역/전국/내 기록)은 제목이 아니라 **계열 머리글**이 말한다. */
export const HUB_TOOLS: readonly HubTool[] = [
  {
    href: "/analysis/price",
    title: "면적대별 실거래 시세",
    desc: "지역·면적대 평단가와 중앙값, 면적 프리미엄을 실거래로",
    icon: "bar",
    tier: "market",
    teaser: "price",
  },
  {
    href: "/analysis/timing",
    title: "시세·타이밍 분석",
    desc: "12개월 지수·모멘텀으로 지역 단위 흐름 판단",
    icon: "trending-up",
    tier: "market",
    teaser: "timing",
  },
  {
    href: "/analysis/temperature",
    title: "지역별 시장 온도",
    desc: "매주 쌓은 온도 기록으로 지금 값이 아니라 추세를 확인",
    icon: "flame",
    tier: "market",
    teaser: "temp",
  },
  {
    href: "/analysis/gap",
    title: "전세가율·갭 스크리너",
    desc: "시군구 전세가율 순위와 실측 우선 갭 — 공표 통계 기반",
    icon: "landmark",
    tier: "market",
    teaser: "gap",
  },
  {
    href: "/notes",
    title: "임장노트 분석",
    desc: "내 기록을 점수화하고 장단점·다음 체크를 정리",
    icon: "notebook-pen",
    tier: "record",
    teaser: "notes",
  },
  {
    href: "/analysis/compare",
    title: "후보 단지 비교",
    desc: "담아 둔 후보 단지를 같은 기준의 표로 나란히",
    icon: "scale",
    tier: "record",
    teaser: "compare",
  },
  /* ── 체험(예시 계산) 구역 — [UI-04] 실데이터와 섞지 않는다 ── */
  {
    href: "/analysis/scenario",
    title: "시장·대출 시나리오",
    desc: "실제 기준금리로 상환 부담 변화를 계산 · 기준가 없으면 예시",
    icon: "calculator",
    tier: "market",
    sim: true,
    teaser: "baseRate",
  },
  {
    href: "/analysis/portfolio",
    title: "자산 배분 시뮬레이터",
    desc: "보유·후보 자산 구성과 갈아타기를 예시로 계산",
    icon: "briefcase",
    tier: "record",
    sim: true,
  },
  {
    href: "/analysis/cycle",
    title: "사이클 전망",
    desc: "국면 순환을 도식으로 이해하는 학습용 화면",
    icon: "repeat",
    tier: "market",
    sim: true,
  },
  {
    href: "/analysis/switch",
    title: "갈아타기 추천 지역",
    desc: "조건을 넣어 갈아타기 시나리오를 예시로 비교",
    icon: "repeat",
    tier: "record",
    sim: true,
  },
] as const;

export const LIVE_TOOLS = HUB_TOOLS.filter((t) => !t.sim);
export const SIM_TOOLS = HUB_TOOLS.filter((t) => t.sim);

/** 계열별 실데이터 도구 — 화면은 이 순서 그대로 그린다. */
export const MARKET_LIVE = LIVE_TOOLS.filter((t) => t.tier === "market");
export const RECORD_LIVE = LIVE_TOOLS.filter((t) => t.tier === "record");

/** 선택 단지를 ?complexId= 로 그대로 받는 도구 — 링크에 붙여 보낸다. */
export const ACCEPTS_COMPLEX: ReadonlySet<string> = new Set([
  "/analysis/scenario",
  "/analysis/compare",
  "/analysis/timing",
]);

/** 워크벤치 도구 총 개수 — 계열 머리글의 "N종" 표기에 쓴다. */
export const AI_TOOL_COUNT = AI_TOOL_IDS.length;
