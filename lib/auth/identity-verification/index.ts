import { mockIdentityProvider } from "./mock-provider";
import { tossIdentityProvider } from "./toss-provider";
import type { IdentityProvider } from "./types";

export * from "./types";

/**
 * 환경변수 `IDENTITY_VERIFICATION_PROVIDER` 로 제공자를 선택합니다.
 * - `toss` → 토스인증(간편인증 표준창)
 * - 미설정/기타 → mock(데모) 제공자
 * - 향후 NICE·KCB 등은 같은 인터페이스로 여기에 추가합니다.
 */
export function getIdentityProvider(): IdentityProvider {
  const id = process.env.IDENTITY_VERIFICATION_PROVIDER?.trim().toLowerCase();
  switch (id) {
    case "toss":
      return tossIdentityProvider;
    // case "nice":
    //   return niceIdentityProvider;
    case "mock":
    default:
      return mockIdentityProvider;
  }
}

/** 현재 설정된 본인인증 제공자 id(미설정 시 빈 문자열). 클라이언트 UI 분기에 사용합니다. */
export function getIdentityProviderId(): string {
  return process.env.IDENTITY_VERIFICATION_PROVIDER?.trim().toLowerCase() ?? "";
}

/**
 * 회원가입 UI에 본인인증 단계를 노출할지 여부.
 * 명시적으로 제공자를 설정한 경우에만 true (mock 포함).
 */
export function isIdentityVerificationConfigured(): boolean {
  return Boolean(process.env.IDENTITY_VERIFICATION_PROVIDER?.trim());
}
