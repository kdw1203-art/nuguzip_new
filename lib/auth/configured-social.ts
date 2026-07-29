import { isGoogleOAuthConfigured } from "@/lib/auth/google-oauth-config";
import { isKakaoOAuthConfigured } from "@/lib/kakao/oauth-config";

export type SocialProvider = "google" | "naver" | "kakao";

function isNaverOAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_NAVER_ID?.trim() && process.env.AUTH_NAVER_SECRET?.trim(),
  );
}

/**
 * auth.ts 가 provider 를 등록하는 조건과 동일해야 한다.
 * 화면 버튼 ↔ NextAuth 등록이 어긋나면 Configuration 에러가 난다.
 */
export function getConfiguredSocialProviders(): SocialProvider[] {
  const social: SocialProvider[] = [];
  if (isKakaoOAuthConfigured()) social.push("kakao");
  if (isNaverOAuthConfigured()) social.push("naver");
  if (isGoogleOAuthConfigured()) social.push("google");
  return social;
}
