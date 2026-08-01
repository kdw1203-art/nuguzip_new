/**
 * 게스트 홈 히어로·CTA 단일 소스.
 * 「임장 기록 → AI 정리 → 지도 비교」루프가 한 호흡으로 읽히게 유지한다.
 */

export const HOME_HERO_BADGE = "AI 임장 기록 플랫폼";

/** 모바일 H1 — emphasis 구간만 gradient */
export const HOME_HERO_MOBILE_LINE1 = "오늘 본 집,";
export const HOME_HERO_MOBILE_EMPHASIS = "3분 만에 기록";
export const HOME_HERO_MOBILE_TAIL = "하세요";

/** 데스크톱 H1 */
export const HOME_HERO_DESKTOP_LEAD = "임장 기록이";
export const HOME_HERO_DESKTOP_EMPHASIS = "판단 근거";
export const HOME_HERO_DESKTOP_TAIL = "가 됩니다";

/** 기기 공통 보조문 — 퍼널을 한 줄로 (저장·AI는 로그인 필요 — 정직하게) */
export const HOME_HERO_SUBLINE =
  "3분 기록 → AI 정리 → 지도 비교. 노트 쓰기로 바로 시작하고, 저장할 때 로그인해요.";

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
export const HOME_AI_GATEWAY_BODY =
  "현장 기록을 저장하면 AI(또는 규칙 초안)로 장단점을 정리합니다. 먼저 노트를 남겨 보세요.";
export const HOME_AI_BRIEFING_LABEL = "오늘의 시장 브리핑 (참고)";
