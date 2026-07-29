import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supabase Auth 이메일 확인·매직링크 콜백.
 *
 * 인증 메일 링크 → Supabase verify → 여기로 redirect(?code=…).
 * 세션 쿠키를 심은 뒤 /login?verified=1 로 보낸다.
 *
 * Site URL / Redirect URLs 에 반드시 등록:
 *   https://nuguzip.com/auth/callback
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/login?verified=1";
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//")
      ? nextRaw
      : "/login?verified=1";

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return NextResponse.redirect(new URL("/login?error=config", origin));
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* ignore — route handler 외에서 set 불가한 경우 */
          }
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const fail = new URL("/login", DEFAULT_DESKTOP_ORIGIN);
      fail.searchParams.set("error", "verify_failed");
      return NextResponse.redirect(fail);
    }
  }

  /* 운영에서는 항상 canonical 도메인으로 — preview 호스트에 세션이 남는 걸 막는다 */
  const base =
    process.env.VERCEL_ENV === "production" ? DEFAULT_DESKTOP_ORIGIN : origin;
  return NextResponse.redirect(new URL(next, base));
}
