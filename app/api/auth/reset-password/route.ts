/**
 * POST /api/auth/reset-password
 * 토큰 검증 후 비밀번호 변경.
 * body: { token: string; password: string }
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServiceSupabase } from "@/lib/supabase/service";
import { applyRateLimit, AUTH_RATE_LIMIT, READ_RATE_LIMIT } from "@/lib/rate-limit";

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
