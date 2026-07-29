import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/**
 * Supabase Auth / OAuth 로만 생긴 계정에 app_users 행이 없으면 최소 행을 만든다.
 * 온보딩·프로필 PATCH 가 app_users 를 전제로 하므로, 없으면 진행이 조용히 실패한다.
 */
export async function ensureAppUserRow(input: {
  email: string;
  name?: string | null;
  authUserId?: string | null;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return;

  const sb = getServiceSupabase();
  if (!sb) return;

  try {
    const { data: existing, error: readErr } = await sb
      .from("app_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (readErr) {
      logger.warn("[ensure-app-user] read", readErr.message);
      return;
    }
    if (existing?.id) return;

    const name =
      input.name?.trim() || email.split("@")[0] || "회원";
    const row: Record<string, unknown> = {
      email,
      name,
      role: "user",
      plan: "free",
      /* 비밀번호 로그인은 Supabase Auth 쪽 — app_users 해시 없이 sentinel */
      password_hash: "supabase-auth-linked",
    };
    if (input.authUserId) {
      row.supabase_user_id = input.authUserId;
    }

    const { error: insertErr } = await sb.from("app_users").insert(row);
    if (insertErr) {
      /* 컬럼 없는 배포는 최소 컬럼만 재시도 */
      const fallback = await sb.from("app_users").insert({
        email,
        name,
        role: "user",
        password_hash: "supabase-auth-linked",
      });
      if (fallback.error) {
        logger.warn("[ensure-app-user] insert", fallback.error.message);
      }
    }
  } catch (e) {
    logger.warn(
      "[ensure-app-user]",
      e instanceof Error ? e.message : String(e),
    );
  }
}
