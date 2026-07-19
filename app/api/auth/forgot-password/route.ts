import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getSupabasePublicKey } from "@/lib/supabase/env";
import { baseUrlForShell, detectShellFromHost } from "@/lib/platform-shell";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/log";

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return NextResponse.json(
      { error: "이메일 초기화 기능이 설정되지 않았습니다. 관리자에게 문의하세요." },
      { status: 503 },
    );
  }

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

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const shell = detectShellFromHost(
    req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
  );
  const redirectTo = `${baseUrlForShell(shell)}/auth/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    logger.error("[forgot-password]", error.message);
  }

  // 이메일 존재 여부를 노출하지 않기 위해 항상 성공 응답 반환
  return NextResponse.json({ ok: true });
}
