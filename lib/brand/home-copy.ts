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

/** 기기 공통 보조문 — 퍼널을 한 줄로 */
export const HOME_HERO_SUBLINE =
  "3분 기록 → AI 정리 → 지도 비교. 로그인 없이 시작하세요.";

/** 루프 단계 하이라이트 (장식용·네비 아님) */
export const HOME_FUNNEL_STEPS = ["기록", "AI", "지도"] as const;

export const HOME_CTA_NOTE = { label: "임장노트 쓰기", href: "/notes/new" } as const;
export const HOME_CTA_MAP = { label: "지도에서 비교", href: "/map" } as const;
/** 샘플 AI 정리 — 분석 허브에서 공개 노트 AI·예시 배지로 연결 */
export const HOME_CTA_AI = {
  label: "AI 정리 미리보기",
  href: "/analysis",
} as const;

export const HOME_AI_GATEWAY_TITLE = "임장노트 AI 정리";
export const HOME_AI_GATEWAY_BODY =
  "현장 기록을 장단점·시세 맥락으로 정리합니다. 공개 노트 AI 요약을 먼저 확인해 보세요.";
export const HOME_AI_BRIEFING_LABEL = "오늘의 시장 브리핑 (참고)";
