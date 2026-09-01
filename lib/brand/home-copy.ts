/**
 * 게스트 홈 히어로·CTA 단일 소스.
 * 「임장 기록 → AI 정리 → 지도 비교」루프가 한 호흡으로 읽히게 유지한다.
 *
 * 방향성 리밸런싱(2026-08): 핵심 타깃은 '발로 뛰는 임장러'(실전 투자자·진지한
 * 실수요자)다. 조회만 하는 앱이 아니라 **기록으로 결정을 만드는 부동산 의사결정
 * 플랫폼**임을 첫 화면에서 말한다. 단, 노트 우선·정직한 퍼널(저장 시 로그인)은 유지.
 */

export const HOME_HERO_BADGE = "임장러를 위한 부동산 의사결정 플랫폼";

/**
 * 문서에 단 하나뿐인 H1. 화면에는 안 보이지만 항상 존재한다.
 *
 * 아래 두 히어로 문구는 오랫동안 각각 `<h1>` 이었다. 그런데 홈은
 * 모바일/데스크톱 두 벌을 **한 문서에 다** 그려 놓고 CSS 로 하나만
 * 보여 준다(S13-13a). 그래서 비로그인 HTML 에는 h1 이 두 개였고,
 * 로그인하면 두 히어로가 전부 `[data-static-hero]` 로 숨어 h1 이
 * **0개**가 됐다. 문서의 제목이 뷰포트와 로그인 여부에 따라 두 개였다가
 * 없어졌다가 한 셈이다.
 *
 * 그래서 제목은 한 군데로 모은다: `<main>` 첫 자식의 sr-only h1 하나.
 * 히어로 문구는 뷰포트별 "시각 카피"로 강등해 `<p>` 로 그린다.
 */
export const HOME_PAGE_H1 = "누구집 — 발로 뛴 임장을 데이터·결정으로 바꾸는 부동산 플랫폼";

/** 모바일 히어로 문구 — emphasis 구간만 gradient (행동 우선, 전환 유지) */
export const HOME_HERO_MOBILE_LINE1 = "오늘 본 집,";
export const HOME_HERO_MOBILE_EMPHASIS = "3분 만에 기록";
export const HOME_HERO_MOBILE_TAIL = "하세요";

/** 데스크톱 히어로 문구 — '발로 뛴 임장'(타깃) → '판단 근거'(의사결정) */
export const HOME_HERO_DESKTOP_LEAD = "발로 뛴 임장이";
export const HOME_HERO_DESKTOP_EMPHASIS = "판단 근거";
export const HOME_HERO_DESKTOP_TAIL = "가 됩니다";

/** 기기 공통 보조문 — 처음 온 사람에게 "무엇을 하는 서비스인지"를 명사로 먼저 말한다.
 *  [945 · 실사용50 #13] 임시 확정 카피 — 소유자의 3인 인터뷰(홈만 보여주고 "무슨
 *  서비스냐" 질문) 후 최종 문구로 교체한다. 이 상수 한 줄만 바꾸면 홈·온보딩에 모두
 *  반영된다(단일 소스). */
export const HOME_HERO_SUBLINE =
  "발로 뛴 임장 기록을 AI가 정리하고 실거래로 검증하는 임장노트 서비스 — 쓰는 건 바로, 로그인은 저장할 때만.";

/** 루프 단계 하이라이트 (장식용·네비 아님) */
export const HOME_FUNNEL_STEPS = ["기록", "AI", "지도"] as const;

export const HOME_CTA_NOTE = { label: "임장노트 쓰기", href: "/notes/new" } as const;
export const HOME_CTA_MAP = { label: "지도에서 비교", href: "/map" } as const;
/** 내 노트 작성 → AI 정리로 이어지는 노트 바운드 CTA (도구 허브 아님) */
export const HOME_CTA_AI = {
  label: "노트로 AI 정리 시작",
  href: "/notes/new?intent=ai",
} as const;

export const HOME_AI_GATEWAY_TITLE = "임장노트 AI 정리";
/* 예시는 지표가 아니라 형태를 보여 준다(수치 창작 아님) — "AI"라는 단어만으로는
   무엇이 좋아지는지 전달되지 않는다는 홈 비판 대응. */
export const HOME_AI_GATEWAY_BODY =
  "현장 기록을 저장하면 AI(또는 규칙 초안)로 장단점을 정리합니다. 예: “복도 결로 흔적, 밤 주차 빡빡” → 리스크 2건·확인 항목으로 정리. 먼저 노트를 남겨 보세요.";
export const HOME_AI_BRIEFING_LABEL = "오늘의 시장 브리핑 (참고)";
