/**
 * 온보딩 기본 정보(인구통계) 화이트리스트 — 클라이언트·서버 공용.
 * (personalization.ts 는 server-only 라 WelcomeClient 에서 직접 import 불가)
 */

export type OnboardingProfile = Record<string, string>;

/** 저장을 허용하는 기본 정보 항목과 값 — 임의 문자열 저장을 막는다. */
export const PROFILE_OPTIONS: Record<string, readonly string[]> = {
  나이대: ["20대", "30대", "40대", "50대+"],
  성별: ["남", "여"],
  가구: ["1인 거주", "2인 거주", "3인 이상"],
  직업: ["직장인", "사업자", "법인"],
  생애최초: ["해당", "비해당"],
  "보유 주택": ["무주택", "1주택", "2주택+"],
};

export function sanitizeProfile(input: unknown): OnboardingProfile | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const out: OnboardingProfile = {};
  for (const [key, allowed] of Object.entries(PROFILE_OPTIONS)) {
    const v = o[key];
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}
