import { randomUUID } from "crypto";
import type {
  IdentityProvider,
  IdentityVerificationResult,
  IdentityVerificationStart,
  StartInput,
  VerifyInput,
} from "./types";

/**
 * 데모 본인인증 제공자.
 *
 * 상용 제공사 키가 없을 때 개발/스테이징에서 흐름을 그대로 시험할 수 있도록
 * 항상 성공하는 모의 검증을 수행합니다. 운영에서는 실제 제공자(NICE 등)로 교체하세요.
 */
const SESSION_TTL_MS = 10 * 60_000;

function digitsOnly(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const d = value.replace(/\D/g, "");
  return d.length >= 9 ? d : undefined;
}

export const mockIdentityProvider: IdentityProvider = {
  id: "mock",

  async startVerification(_input: StartInput): Promise<IdentityVerificationStart> {
    void _input;
    const sessionId = randomUUID();
    return {
      sessionId,
      mock: true,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };
  },

  async verifyResult({
    sessionId,
    payload,
  }: VerifyInput): Promise<IdentityVerificationResult> {
    const name =
      typeof payload?.name === "string" && payload.name.trim()
        ? payload.name.trim()
        : "데모 사용자";
    const phone = digitsOnly(payload?.phone) ?? "01000000000";
    return {
      verified: true,
      name,
      phone,
      provider: "mock",
      di: `mock-di-${sessionId.slice(0, 8)}`,
      message: "데모 본인인증이 완료되었습니다. (실제 인증 아님)",
    };
  },
};
