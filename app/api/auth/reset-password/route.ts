/**
 * POST /api/auth/reset-password
 * 토큰 검증 후 비밀번호 변경.
 * body: { token: string; password: string }
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServiceSupabase } from "@/lib/supabase/service";
import { applyRateLimit, AUTH_RATE_LIMIT, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { findAuthUserByEmail } from "@/lib/auth/find-auth-user";
import { logger } from "@/lib/log";
import { maskEmailPublic } from "@/lib/privacy/mask-email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };

  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");

  if (!token) {
    return NextResponse.json({ error: "토큰이 없습니다." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "비밀번호는 8자 이상이어야 합니다." },
      { status: 400 },
    );
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "서비스를 이용할 수 없습니다." }, { status: 503 });
  }

  // 토큰 조회 (미사용 + 미만료)
  const { data: row } = await sb
    .from("password_reset_tokens")
    .select("id, user_email, expires_at, used")
    .eq("token", token)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다." }, { status: 400 });
  }
  if (row.used) {
    return NextResponse.json({ error: "이미 사용된 링크입니다." }, { status: 400 });
  }
  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "링크가 만료됐습니다. 다시 요청해 주세요." }, { status: 400 });
  }

  /* [965] Supabase Auth 쪽 비밀번호도 같이 바꾼다.
     가입은 대부분 Supabase Auth(인증 메일) 경로라 비밀번호가 그쪽에 있고,
     app_users.password_hash 는 "supabase-auth-linked" 표식뿐이다. 예전엔 여기서
     app_users 해시만 갱신해서 **새 비밀번호도 되고 옛 비밀번호도 되는** 계정이
     됐다(로그인이 bcrypt → Supabase Auth 순서로 둘 다 시도한다). 재설정은 옛
     비밀번호를 무효화해야 의미가 있다. 메일 링크를 눌렀으니 이메일 소유는
     증명됐다 — 미인증 계정이면 그 사실도 함께 기록한다. */
  try {
    const authUser = await findAuthUserByEmail(row.user_email);
    if (authUser) {
      const { error: authErr } = await sb.auth.admin.updateUserById(authUser.id, {
        password,
        ...(authUser.email_confirmed_at ? {} : { email_confirm: true }),
      });
      if (authErr) {
        logger.error("[reset-password] Supabase Auth 비밀번호 갱신 실패", {
          message: authErr.message,
          email: maskEmailPublic(row.user_email),
        });
        return NextResponse.json(
          { error: "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요." },
          { status: 500 },
        );
      }
    }
  } catch (e) {
    logger.error("[reset-password] Supabase Auth 사용자 조회 실패", e);
    return NextResponse.json(
      { error: "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  const password_hash = await bcrypt.hash(password, 12);

  // 비밀번호 업데이트
  const { error: updateErr } = await sb
    .from("app_users")
    .update({ password_hash })
    .eq("email", row.user_email);

  if (updateErr) {
    return NextResponse.json({ error: "비밀번호 변경에 실패했습니다." }, { status: 500 });
  }

  // 토큰 소비 처리
  await sb.from("password_reset_tokens").update({ used: true }).eq("id", row.id);

  return NextResponse.json({ ok: true, email: row.user_email });
}

/** GET /api/auth/reset-password?token=xxx — 토큰 유효성만 확인 */
export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  if (!token) {
    return NextResponse.json({ valid: false, error: "토큰 없음" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ valid: false, error: "서비스 미설정" }, { status: 503 });
  }

  const { data: row } = await sb
    .from("password_reset_tokens")
    .select("expires_at, used")
    .eq("token", token)
    .maybeSingle();

  if (!row || row.used || new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({ valid: true });
}
