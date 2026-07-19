import { logger } from "@/lib/log";

/** Cloudflare Turnstile — `TURNSTILE_SECRET_KEY` 미설정 시 검증 생략(개발 편의). */
export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;

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
