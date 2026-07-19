/**
 * Google 로그인 — Google Identity Services(GIS) 권장.
 *
 * - 구 **Google Sign-In JavaScript 라이브러리**는 deprecated 입니다.
 * - 신규·유지보수는 **GIS**(Sign In with Google / One Tap) 또는 **OAuth 2.0**
 *   Authorization Code 흐름을 사용하세요.
 *
 * **본 앱**: NextAuth Google Provider = 서버 OAuth 2.0 (GIS와 동일 백엔드, 별도 GSI JS 불필요).
 * Redirect URI: `{AUTH_URL}/api/auth/callback/google`
 *
 * @see https://developers.google.com/identity/gsi/web/guides/overview
 * @see https://developers.google.com/identity/sign-in/web/discontinued
 */

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_GOOGLE_ID?.trim() &&
      process.env.AUTH_GOOGLE_SECRET?.trim(),
  );
}

export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/callback/google";

export function googleOAuthRedirectUri(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${GOOGLE_OAUTH_CALLBACK_PATH}`;
}

/** GIS One Tap / FedCM 을 추가할 때 사용할 공개 Client ID (OAuth Client ID 와 동일) */
export function getGoogleOAuthClientId(): string | null {
  return process.env.AUTH_GOOGLE_ID?.trim() || null;
}
