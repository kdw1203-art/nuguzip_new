/**
 * 본인인증(PASS·휴대폰 실명확인) 공통 인터페이스.
 *
 * NICE평가정보·KCB·토스·다날 등 상용 본인확인 서비스를 같은 인터페이스 뒤에 끼워 넣기 위한
 * 추상화 계층입니다. 실제 제공사 키가 없으면 mock 제공자가 데모 검증으로 동작합니다.
 */

export type IdentityVerificationStart = {
  /** 검증 세션 식별자. verify 단계에서 다시 전달합니다. */
  sessionId: string;
  /** 상용 제공사: 사용자를 보낼 팝업/리다이렉트 URL. */
  redirectUrl?: string;
  /** mock/데모 제공자: 인라인 확인 UI를 렌더링하라는 표시. */
  mock?: boolean;
  /** 세션 만료 시각(ISO). */
  expiresAt: string;
};

export type IdentityVerificationResult = {
  verified: boolean;
  name?: string;
  phone?: string;
  birthdate?: string;
  gender?: string;
  /** 연계정보(CI) — 제공사가 반환하는 개인 식별값. */
  ci?: string;
  /** 중복가입확인정보(DI). */
  di?: string;
  /** 검증을 수행한 제공자 id. */
  provider: string;
  /** 실패 시 사용자 안내 메시지. */
  message?: string;
};

export type StartInput = {
  /** 검증 완료 후 돌아올 URL(상용 제공사용). */
  redirectUrl?: string;
};

export type VerifyInput = {
  sessionId: string;
  /** 상용 제공사가 콜백으로 넘기는 인증 코드/토큰. */
  code?: string;
  /** mock 제공자에서 사용하는 입력값(이름·휴대폰 등). */
  payload?: Record<string, unknown>;
};

export interface IdentityProvider {
  readonly id: string;
  startVerification(input: StartInput): Promise<IdentityVerificationStart>;
  verifyResult(input: VerifyInput): Promise<IdentityVerificationResult>;
}
