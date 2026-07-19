/**
 * 카카오 Developers 연동 설정·운영 체크리스트.
 *
 * **로그인 콜백**: NextAuth(Auth.js)가 처리합니다. 별도 `/api/auth/kakao/callback` 을
 * 만들지 마세요. Kakao Developers → Redirect URI:
 *   `{AUTH_URL}/api/auth/callback/kakao`
 * (예: `https://nuguzip.com/api/auth/callback/kakao`, 로컬 `http://localhost:3000/api/auth/callback/kakao`)
 *
 * KOE006: 등록되지 않은 redirect URI — 콘솔 URI와 AUTH_URL 호스트·포트가 정확히 일치해야 합니다.
 *
 * @see https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api
 */

export type KakaoRolloutPhase = {
  step: number;
  id: string;
  feature: string;
  reason: string;
  /** 코드베이스 반영 여부(환경변수·라우트 존재 기준) */
  status: "live" | "partial" | "planned";
};

export function isKakaoOAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_KAKAO_ID?.trim() && process.env.AUTH_KAKAO_SECRET?.trim(),
  );
}

export function getKakaoJsKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_KAKAO_JS_KEY?.trim() ||
    process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim() ||
    null
  );
}

export function isKakaoShareConfigured(): boolean {
  return Boolean(getKakaoJsKey());
}

/** NextAuth OAuth 콜백 경로(호스트 제외) */
export const KAKAO_OAUTH_CALLBACK_PATH = "/api/auth/callback/kakao";

/**
 * 카카오싱크·로그인 동의항목(scope).
 * 콘솔 → 카카오 로그인 → 동의항목에서 활성화·필수/선택 설정 후 사용하세요.
 */
export const KAKAO_LOGIN_SCOPES = [
  "profile_nickname",
  "profile_image",
  "account_email",
] as const;

export function kakaoOAuthRedirectUri(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${KAKAO_OAUTH_CALLBACK_PATH}`;
}

function rolloutStatus(
  live: boolean,
  partial = false,
): KakaoRolloutPhase["status"] {
  if (live) return "live";
  if (partial) return "partial";
  return "planned";
}

/** 공개 문서 기준 도입 우선순위 — 콘솔 권한 신청·기능 롤아웃 참고 */
export function getKakaoRolloutPhases(): KakaoRolloutPhase[] {
  const oauth = isKakaoOAuthConfigured();
  const share = isKakaoShareConfigured();
  const pay = Boolean(
    process.env.KAKAOPAY_CID?.trim() &&
      process.env.KAKAOPAY_SECRET_KEY?.trim(),
  );
  const local = Boolean(
    process.env.KAKAO_REST_API_KEY?.trim() ||
      process.env.KAKAO_LOCAL_API_KEY?.trim(),
  );

  const phases: KakaoRolloutPhase[] = [
    {
      step: 1,
      id: "login-sync",
      feature: "카카오 로그인 + 카카오싱크",
      reason: "회원가입 마찰 최소화",
      status: rolloutStatus(oauth, !oauth),
    },
    {
      step: 2,
      id: "talk-share",
      feature: "카카오톡 공유 초대",
      reason: "바이럴 루프 — 권한 허들 낮음",
      status: rolloutStatus(share, oauth && !share),
    },
    {
      step: 3,
      id: "channel-crm",
      feature: "채널 추가 / 고객파일",
      reason: "마케팅 자동화",
      status: "planned",
    },
    {
      step: 4,
      id: "friend-message",
      feature: "친구 목록·메시지 API",
      reason: "동일 서비스 가입자 간만 — 권한·심사 필요",
      status: "planned",
    },
    {
      step: 5,
      id: "talk-calendar",
      feature: "톡캘린더 일정·할 일",
      reason: "모임·임장 일정 (talk_calendar 권한)",
      status: "planned",
    },
    {
      step: 0,
      id: "local-api",
      feature: "Kakao Local (주변 업체)",
      reason: "지도·임장 보조 — REST API 키",
      status: rolloutStatus(local),
    },
    {
      step: 0,
      id: "kakaopay",
      feature: "카카오페이 단건",
      reason: "국내 단건 결제",
      status: rolloutStatus(pay),
    },
  ];
  phases.sort((a, b) => a.step - b.step || a.id.localeCompare(b.id));
  return phases;
}
