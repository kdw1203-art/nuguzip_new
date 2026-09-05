import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { CredentialsSignin } from "next-auth";
import type { UserRole } from "@/lib/auth/types";

/**
 * [965] 이메일 미인증을 Auth.js 가 **코드로** 전달하게 한다.
 *
 * 예전에는 `new Error("EMAIL_NOT_CONFIRMED")` 를 던졌다. Auth.js v5 는 authorize()
 * 안에서 던진 일반 Error 를 `CallbackRouteError` 로 감싸고, 클라이언트 `signIn()`
 * 결과에는 `error: "CallbackRouteError"` 만 남는다 — 메시지는 서버 로그에만 있다.
 * 그래서 /login 은 "email_not_confirmed" 를 찾지 못하고 "비밀번호가 올바르지
 * 않습니다" 를 보여줬다. 인증 메일만 누르면 되는 사람에게 비밀번호를 의심하게
 * 만든 셈이다.
 *
 * `CredentialsSignin` 의 하위 클래스는 `code` 가 그대로 `signIn()` 결과의
 * `res.code` 로 내려온다(리다이렉트 모드에서는 `?code=` 쿼리). 화면은 이 코드로
 * "인증 메일 다시 보내기" 를 안내한다.
 */
export class EmailNotConfirmedError extends CredentialsSignin {
  code = "email_not_confirmed";
}
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";
import { getServiceSupabase } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/rate-limit";
import { recordAuthLoginOutcome } from "@/lib/auth/login-telemetry";

type Creds = Record<"email" | "password", string> | undefined;

async function tryAppUsersBcrypt(
  email: string,
  password: string,
): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
} | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;

  const { data: row, error } = await sb
    .from("app_users")
    .select("id, email, name, password_hash, role")
    .eq("email", email)
    .maybeSingle();

  if (error || !row?.password_hash) return null;

  const ok = await bcrypt.compare(password, row.password_hash as string);
  if (!ok) return null;

  const role: UserRole =
    (row.role as string) === "admin" ? "admin" : "user";

  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name ?? row.email.split("@")[0] ?? "회원"),
    role,
  };
}

/** Supabase Auth(대시보드·signUp) 사용자 — anon/Publishable 키만으로 검증 */
async function trySupabaseAuthPassword(
  email: string,
  password: string,
): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
} | null> {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return null;

  const anon = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user?.email) {
    const msg = (error?.message ?? "").toLowerCase();
    const code = (error as { code?: string } | null)?.code ?? "";
    if (
      code === "email_not_confirmed" ||
      msg.includes("email not confirmed") ||
      msg.includes("email_not_confirmed")
    ) {
      throw new EmailNotConfirmedError();
    }
    return null;
  }

  const meta = data.user.user_metadata as Record<string, unknown> | undefined;
  const nameFromMeta =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.name === "string"
        ? meta.name
        : undefined;

  try {
    const { ensureAppUserRow } = await import("@/lib/auth/ensure-app-user");
    await ensureAppUserRow({
      email: data.user.email,
      name: nameFromMeta,
      authUserId: data.user.id,
    });
  } catch {
    /* best-effort — 로그인 자체는 막지 않는다 */
  }

  return {
    id: data.user.id,
    email: data.user.email,
    name: nameFromMeta ?? data.user.email.split("@")[0] ?? "회원",
    role: "user",
  };
}

export async function authorizeWithPassword(
  credentials: Creds,
): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
} | null> {
  const email = String(credentials?.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(credentials?.password ?? "");
  if (!email.includes("@") || password.length < 8) {
    void recordAuthLoginOutcome({
      ok: false,
      provider: "password",
      reason: "invalid_input",
    });
    return null;
  }

  /* 이메일별 비밀번호 시도 제한 — NextAuth POST IP 한도와 이중으로 */
  const rl = rateLimit(`password-login:${email}`, {
    limit: 12,
    windowMs: 15 * 60_000,
  });
  if (!rl.ok) {
    void recordAuthLoginOutcome({
      ok: false,
      provider: "password",
      reason: "rate_limited",
    });
    return null;
  }

  const fromDb = await tryAppUsersBcrypt(email, password);
  if (fromDb) {
    void recordAuthLoginOutcome({
      ok: true,
      provider: "password",
      userEmail: fromDb.email,
    });
    return fromDb;
  }

  try {
    const fromSb = await trySupabaseAuthPassword(email, password);
    if (fromSb) {
      void recordAuthLoginOutcome({
        ok: true,
        provider: "password",
        userEmail: fromSb.email,
      });
      return fromSb;
    }
    void recordAuthLoginOutcome({
      ok: false,
      provider: "password",
      reason: "bad_credentials",
    });
    return null;
  } catch (e) {
    if (e instanceof EmailNotConfirmedError) {
      void recordAuthLoginOutcome({
        ok: false,
        provider: "password",
        reason: "email_not_confirmed",
      });
      throw e;
    }
    void recordAuthLoginOutcome({
      ok: false,
      provider: "password",
      reason: "unknown",
    });
    return null;
  }
}
