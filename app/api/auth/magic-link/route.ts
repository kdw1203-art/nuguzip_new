import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getSupabasePublicKey } from "@/lib/supabase/env";
import { baseUrlForShell, detectShellFromHost } from "@/lib/platform-shell";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/auth/verify-turnstile";
import { logger } from "@/lib/log";

/** 이메일 매직 링크(비밀번호 없이 로그인) — Supabase OTP */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return NextResponse.json(
      { error: "매직 링크 로그인이 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  let email: string;
  let captchaToken: string | undefined;
  try {
    const body = (await req.json()) as { email?: unknown; captchaToken?: unknown };
    email = String(body.email ?? "").trim().toLowerCase();
    captchaToken = body.captchaToken ? String(body.captchaToken) : undefined;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!email.includes("@")) {
    return NextResponse.json({ error: "올바른 이메일 주소를 입력해 주세요." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const captchaOk = await verifyTurnstile(captchaToken, ip);
  if (!captchaOk) {
    return NextResponse.json(
      { error: "보안 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요." },
      { status: 403 },
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const shell = detectShellFromHost(
    req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
  );
  const redirectTo = `${baseUrlForShell(shell)}/auth/login?verified=1`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    logger.error("[magic-link]", error.message);
  }

  return NextResponse.json({ ok: true });
}
