/**
 * 토스 로그인(앱인토스) 연동 구성 — 서버 전용.
 *
 * 적용 환경:
 *  - 앱인토스 미니앱: 별도 계약 없이 사용 가능(콘솔에서 토스 로그인 신청·설정).
 *  - 자체 웹(nuguzip.com): 토스 인증 부서(cert.support@toss.im) 계약 후 Client ID 발급 필요.
 *
 * @see https://developers-apps-in-toss.toss.im/login/intro.md
 *
 * ⚠️ 실제 로그인 토큰 교환·응답 복호화는 "개발 연동하기" 문서의 SDK/엔드포인트 명세가 있어야
 *    정확히 구현할 수 있습니다. 이 모듈은 환경설정·연결끊기 콜백 검증 등 명세가 확정된 부분만 담습니다.
 */

/** 토스 로그인 동의 항목(스코프). @see 콘솔 > 토스 로그인 > 동의 항목 */
export const TOSS_LOGIN_SCOPES = [
  "USER_NAME",
  "USER_EMAIL",
  "USER_GENDER",
  "USER_BIRTHDAY",
  "USER_NATIONALITY",
  "USER_PHONE",
  "USER_CI",
] as const;

export type TossLoginScope = (typeof TOSS_LOGIN_SCOPES)[number];

/** 연결 끊기 콜백 referrer — 사용자가 연결을 해제한 경로. */
export type TossUnlinkReferrer =
  | "UNLINK" // 앱에서 직접 연결 끊기 → 로그아웃 처리
  | "WITHDRAWAL_TERMS" // 로그인 서비스 약관 철회
  | "WITHDRAWAL_TOSS"; // 토스 회원 탈퇴

/** 토스 로그인 API BaseURL. @see https://developers-apps-in-toss.toss.im/login/develop.md */
export const TOSS_LOGIN_API_BASE_URL =
  process.env.TOSS_LOGIN_API_BASE_URL?.trim().replace(/\/$/, "") ||
  "https://apps-in-toss-api.toss.im";

export function getTossLoginClientId(): string | undefined {
  return process.env.TOSS_LOGIN_CLIENT_ID?.trim() || undefined;
}

/** 토스 로그인 응답 복호화 키(콘솔 '복호화 키 확인하기'에서 발급). 외부 노출 금지. */
export function getTossLoginDecryptKey(): string | undefined {
  return process.env.TOSS_LOGIN_DECRYPT_KEY?.trim() || undefined;
}

/**
 * 복호화 AAD(Additional Authenticated Data) — 복호화 키와 함께 이메일로 전달됩니다.
 * AES-256-GCM 복호화 시 updateAAD 로 사용합니다.
 */
export function getTossLoginDecryptAad(): string | undefined {
  return process.env.TOSS_LOGIN_DECRYPT_AAD?.trim() || undefined;
}

/**
 * 토큰 교환 엔드포인트 호출 시 붙일 파트너 인증 헤더(필요한 경우).
 * 문서에는 명시되지 않았으나 일부 파트너 환경에서 요구될 수 있어 환경변수로 둡니다.
 * 예: "Bearer xxxx" 또는 "Basic xxxx".
 */
export function getTossLoginPartnerAuthHeader(): string | undefined {
  return process.env.TOSS_LOGIN_PARTNER_AUTH?.trim() || undefined;
}

/**
 * 토스 로그인(로그인 플로우) 활성화 여부 — Client ID 만 있으면 토큰 교환·사용자 식별(userKey)이 가능.
 * 개인정보(이름·CI 등) 복호화는 추가로 복호화 키가 필요합니다(isTossLoginConfigured).
 */
export function isTossLoginEnabled(): boolean {
  return Boolean(getTossLoginClientId());
}

/** 로그인 완료 후 이동할 redirect_uri (콘솔/계약 시 등록한 값과 일치해야 함). */
export function getTossLoginRedirectUri(): string | undefined {
  return process.env.TOSS_LOGIN_REDIRECT_URI?.trim() || undefined;
}

/**
 * 연결 끊기 콜백 Basic Auth 검증값.
 * 콘솔에 입력한 값과 동일한 평문을 환경변수에 넣으면, 콜백 헤더(base64)를 디코딩해 일치 검증합니다.
 * 형식은 콘솔 입력값 그대로(예: "user:pass" 또는 단일 토큰).
 */
export function getTossLoginUnlinkBasic(): string | undefined {
  return process.env.TOSS_LOGIN_UNLINK_BASIC?.trim() || undefined;
}

/** 로그인 플로우 구현에 필요한 최소 구성이 갖춰졌는지(Client ID + 복호화 키). */
export function isTossLoginConfigured(): boolean {
  return Boolean(getTossLoginClientId() && getTossLoginDecryptKey());
}

/**
 * 연결 끊기 콜백의 Authorization: Basic <base64> 헤더를 검증합니다.
 * @returns 검증 통과 여부. 미설정(env 없음) 시 false(거부).
 */
export function verifyTossUnlinkBasicAuth(
  authorizationHeader: string | null,
): boolean {
  const expected = getTossLoginUnlinkBasic();
  if (!expected) return false;
  if (!authorizationHeader) return false;
  const m = /^Basic\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!m) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return false;
  }
  return timingSafeEqualStr(decoded, expected);
}

/** 길이/내용 노출을 줄이는 상수시간 비교(best-effort). */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
