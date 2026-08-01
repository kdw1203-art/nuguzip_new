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
      /* mock 은 무조건 verified:true 를 돌려주는 데모 제공자다 — 프로덕션에서
         이걸 본인인증이라고 부르면 인증 절차 전체가 장식이 된다. */
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "IDENTITY_VERIFICATION_PROVIDER=mock 은 프로덕션에서 쓸 수 없습니다 — 전원 통과 데모 제공자입니다.",
        );
      }
      return mockIdentityProvider;
    default:
      /* 오타·미지원 값이 조용히 mock(전원 통과)으로 떨어지던 것을 막는다.
         "toss" 를 "tosss" 로 잘못 적으면 인증이 꺼진 게 아니라 **전원
         통과로 켜져** 있었다 — 설정 실수는 소리 내며 실패해야 한다. */
      throw new Error(
        `IDENTITY_VERIFICATION_PROVIDER 값 "${id ?? ""}" 을 인식하지 못했습니다 (지원: toss, mock[개발 전용]).`,
      );
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
