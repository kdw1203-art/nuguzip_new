import { logger } from "@/lib/log";

/**
 * Cloudflare Turnstile 검증.
 *
 * 키가 없을 때의 처리를 환경에 따라 나눈다. 개발에서는 종전대로 통과시킨다(로컬에
 * Turnstile 키를 두게 하면 아무도 안 쓴다). 다만 프로덕션에서 그렇게 하면 캡차를
 * 붙여 둔 화면 전부가 **환경변수 하나 빠진 것만으로 조용히 무방비**가 된다 —
 * 캡차가 걸려 있다고 믿는 쪽이 없는 것보다 위험하다. 그래서 프로덕션은 거절한다.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("[turnstile] TURNSTILE_SECRET_KEY 미설정 — 검증을 통과시키지 않는다.");
      return false;
    }
    return true;
  }

  const response = String(token ?? "").trim();
  if (!response) return false;

  try {
    const body = new URLSearchParams({
      secret,
      response,
      ...(ip ? { remoteip: ip } : {}),
    });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch (err) {
    logger.error("[turnstile]", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export function turnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return key || null;
}
