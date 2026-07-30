import { isGoogleOAuthConfigured } from "@/lib/auth/google-oauth-config";

/**
 * 로그인 소셜 제공자 — 제품 정책: Google만.
 * (네이버는 지도/검색, 카카오는 Pay·공유 등 비로그인 연동만 유지)
 */
export type SocialProvider = "google";

/**
 * auth.ts 가 provider 를 등록하는 조건과 동일해야 한다.
 * 화면 버튼 ↔ NextAuth 등록이 어긋나면 Configuration 에러가 난다.
 */
export function getConfiguredSocialProviders(): SocialProvider[] {
  return isGoogleOAuthConfigured() ? ["google"] : [];
}
