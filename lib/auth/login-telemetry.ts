import { recordPlatformEvent } from "@/lib/platform-events";
import { FUNNEL_EVENT } from "@/lib/platform-funnel-events";

export type AuthLoginProvider = "password" | "google" | "kakao" | "unknown";
export type AuthLoginFailReason =
  | "invalid_input"
  | "rate_limited"
  | "bad_credentials"
  | "email_not_confirmed"
  | "oauth_error"
  | "unknown";

/**
 * 로그인 성공/실패 계측. 비밀번호·전체 이메일은 넣지 않는다.
 * userEmail 은 성공 시만(또는 실패 시 해시 없이 null) — 실패율은 provider/reason 집계.
 */
export async function recordAuthLoginOutcome(input: {
  ok: boolean;
  provider: AuthLoginProvider;
  reason?: AuthLoginFailReason;
  /** 성공 시에만 — 소문자 이메일 */
  userEmail?: string | null;
  path?: string | null;
}): Promise<void> {
  try {
    await recordPlatformEvent({
      platform: "desktop",
      eventName: input.ok ? FUNNEL_EVENT.AUTH_LOGIN_OK : FUNNEL_EVENT.AUTH_LOGIN_FAIL,
      userEmail: input.ok ? input.userEmail ?? null : null,
      source: "auth",
      campaign: "login_monitor",
      path: input.path ?? "/login",
      metadata: {
        provider: input.provider,
        ...(input.ok ? {} : { reason: input.reason ?? "unknown" }),
      },
    });
  } catch {
    /* 계측 실패는 로그인 흐름을 막지 않음 */
  }
}
