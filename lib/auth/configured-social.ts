import { isGoogleOAuthConfigured } from "@/lib/auth/google-oauth-config";
import { isTossLoginStartable } from "@/lib/auth/toss-login";

/**
 * 로그인 소셜 제공자 — Google + 토스.
 * (네이버는 지도/검색, 카카오는 Pay·공유 등 비로그인 연동만 유지)
 *
 * 토스는 NextAuth OAuth 프로바이더가 아니라 리다이렉트 시작점
 * (/api/auth/toss/start)이 따로 있는 흐름이다. 버튼 노출 조건은
 * isTossLoginStartable() — 인가 주소·클라이언트 ID·복호화 키가 전부 있어야
 * 끝까지 갈 수 있고, 중간까지만 되는 버튼은 누른 사람만 실패를 본다.
 */
export type SocialProvider = "google" | "toss";

/**
 * auth.ts 가 provider 를 등록하는 조건과 동일해야 한다.
 * 화면 버튼 ↔ NextAuth 등록이 어긋나면 Configuration 에러가 난다.
 */
export function getConfiguredSocialProviders(): SocialProvider[] {
  const out: SocialProvider[] = [];
  if (isTossLoginStartable()) out.push("toss");
  if (isGoogleOAuthConfigured()) out.push("google");
  return out;
}
