import { logger } from "@/lib/log";

/**
 * Cloudflare Turnstile 검증.
 *
 * 키가 없을 때를 **세 갈래**로 나눈다. 처음엔 "프로덕션이면 무조건 거절"로 썼는데
 * 그건 틀렸다 — 이 서비스는 아직 Turnstile 을 붙이지 않았다(사이트 키가 없고,
 * turnstileSiteKey() 를 호출하는 화면이 없어 위젯 자체가 뜨지 않는다). 그 상태에서
 * 거절하면 켠 적도 없는 기능 때문에 login-guard 가 403 을 내고 **로그인이 통째로
 * 막힌다.** 그건 보안이 아니라 장애다.
 *
 *  1) 시크릿 있음                  → 정상 검증
 *  2) 시크릿 없음 + 사이트 키 있음 → 거절. 화면엔 캡차가 떠 있는데 서버가 검증을
 *     못 하는 상태다. 통과시키면 "캡차가 걸려 있다고 믿는 무방비"가 되는데,
 *     그건 캡차가 아예 없는 것보다 위험하다.
 *  3) 시크릿 없음 + 사이트 키 없음 → 통과. Turnstile 미도입 구성이다. 다만
 *     프로덕션에서는 한 번 경고를 남겨 "꺼져 있다"는 사실이 로그에 보이게 한다.
 *
 * 공개 서비스라면 로그인·매직링크에 캡차를 붙이는 편이 낫다. 켤 때는 사이트 키와
 * 시크릿을 **함께** 넣어야 한다 — 하나만 넣으면 2번으로 떨어져 로그인이 막힌다.
 */
let warnedTurnstileDisabled = false;

export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    const siteKeyConfigured = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());
    if (siteKeyConfigured && process.env.NODE_ENV === "production") {
      logger.error(
        "[turnstile] 사이트 키는 있는데 TURNSTILE_SECRET_KEY 가 없다 — 검증 불가라 거절한다.",
      );
      return false;
    }
    if (process.env.NODE_ENV === "production" && !warnedTurnstileDisabled) {
      logger.warn("[turnstile] 키가 없어 캡차 검증을 건너뛴다(미도입 상태).");
      warnedTurnstileDisabled = true;
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
