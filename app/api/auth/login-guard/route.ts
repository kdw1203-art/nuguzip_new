import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/auth/verify-turnstile";

/** 로그인 직전 rate limit + invisible captcha 검증 (A41) */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) {
    const retry = limited.headers.get("Retry-After");
    return NextResponse.json(
      {
        error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        suspicious: true,
        retryAfter: retry ? Number(retry) : undefined,
      },
      { status: 429, headers: limited.headers },
    );
  }

  let captchaToken: string | undefined;
  try {
    const body = (await req.json()) as { captchaToken?: unknown };
    captchaToken = body.captchaToken ? String(body.captchaToken) : undefined;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const captchaOk = await verifyTurnstile(captchaToken, ip);
  if (!captchaOk) {
    return NextResponse.json(
      {
        error: "보안 확인에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
        suspicious: true,
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
