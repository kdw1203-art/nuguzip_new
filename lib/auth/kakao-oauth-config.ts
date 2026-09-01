/**
 * [945 · 실사용50 #10] 카카오 로그인 — 국내 사용자 가입 마찰 제거.
 *
 * NextAuth Kakao Provider = 표준 OAuth 2.0 (카카오 로그인 REST 방식).
 * 카카오 개발자 콘솔(developers.kakao.com)에서:
 * 1. 앱 생성 → 제품 설정 > 카카오 로그인 활성화
 * 2. Redirect URI 등록 (정확히):
 *    - `https://nuguzip.com/api/auth/callback/kakao`
 *    - `https://www.nuguzip.com/api/auth/callback/kakao` (www 사용 시)
 *    - `http://localhost:3000/api/auth/callback/kakao` (로컬)
 * 3. 동의항목: 닉네임(필수), **카카오계정 이메일(선택 동의 권장)**
 *    — 이메일 동의항목은 비즈 앱 전환 후 사용 가능. 이메일 미제공 사용자는
 *      `kakao-{id}@noreply.nuguzip.com` 합성 주소로 세션 식별만 한다(발송 불가 주소).
 * 4. 앱 키 → Vercel 환경변수:
 *    - `AUTH_KAKAO_ID`     = REST API 키
 *    - `AUTH_KAKAO_SECRET` = 제품 설정 > 카카오 로그인 > 보안 > Client Secret (활성화 필수)
 *
 * 버튼 노출(configured-social)과 NextAuth 등록(auth.ts)이 **이 함수 하나**를
 * 같이 쓴다 — 판정이 갈라지면 눌러야만 실패를 아는 버튼이 생긴다.
 */

export function isKakaoOAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_KAKAO_ID?.trim() && process.env.AUTH_KAKAO_SECRET?.trim(),
  );
}

export const KAKAO_OAUTH_CALLBACK_PATH = "/api/auth/callback/kakao";
