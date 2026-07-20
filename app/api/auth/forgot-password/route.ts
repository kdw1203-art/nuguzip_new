import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getSupabasePublicKey } from "@/lib/supabase/env";
import { getServiceSupabase } from "@/lib/supabase/service";
import { baseUrlForShell, detectShellFromHost } from "@/lib/platform-shell";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates";
import { logger } from "@/lib/log";

const TOKEN_TTL_MINUTES = 60;

/**
 * 자체 재설정 토큰 발급 + Resend 이메일 발송 경로.
 * (app_users 사용자 대상 — /reset-password?token= 에서 /api/auth/reset-password 로 검증·변경)
 * 성공적으로 메일을 보냈을 때만 true 반환. 실패 시 Supabase Auth 경로로 폴백.
 */
async function trySendSelfTokenEmail(email: string, baseUrl: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;

  try {
    // 가입된 사용자에게만 발송 (존재 여부는 응답에 노출하지 않음)
    const { data: user } = await sb
      .from("app_users")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (!user) return false;

    const token =
      globalThis.crypto.randomUUID().replace(/-/g, "") +
      globalThis.crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();

    const { error: insertErr } = await sb.from("password_reset_tokens").insert({
      token,
      user_email: email,
      expires_at: expiresAt,
      used: false,
    });
    if (insertErr) {
      logger.error("[forgot-password] 토큰 저장 실패:", insertErr.message);
      return false;
    }

    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const result = await sendEmail({
      to: email,
      ...passwordResetEmail({ resetUrl, expiresMinutes: TOKEN_TTL_MINUTES }),
    });
    if (!result.sent) {
      logger.error("[forgot-password] 재설정 메일 발송 실패:", result.reason);
      return false;
    }
    return true;
  } catch (e) {
    logger.error("[forgot-password] 자체 토큰 경로 오류", e);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`forgot-password:${getClientIp(req)}`, {
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let email: string;
  try {
    const body = await req.json() as { email?: unknown };
    email = String(body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!email.includes("@")) {
    return NextResponse.json({ error: "올바른 이메일 주소를 입력해 주세요." }, { status: 400 });
  }

  const shell = detectShellFromHost(
    req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
  );
  const baseUrl = baseUrlForShell(shell);

  // 1) 이메일 프로바이더(Resend)가 설정돼 있으면 자체 토큰 메일 발송 우선
  if (isEmailConfigured()) {
    const sent = await trySendSelfTokenEmail(email, baseUrl);
    if (sent) {
      // 이메일 존재 여부를 노출하지 않기 위해 항상 성공 응답 반환
      return NextResponse.json({ ok: true });
    }
  }

  // 2) 폴백: Supabase Auth 재설정 메일
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return NextResponse.json(
      { error: "이메일 초기화 기능이 설정되지 않았습니다. 관리자에게 문의하세요." },
      { status: 503 },
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const redirectTo = `${baseUrl}/auth/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    logger.error("[forgot-password]", error.message);
  }

  // 이메일 존재 여부를 노출하지 않기 위해 항상 성공 응답 반환
  return NextResponse.json({ ok: true });
}
