import type { User } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/**
 * 이메일 → Supabase Auth 사용자.
 *
 * [965] 예전 구현은 `auth.admin.listUsers` 를 200명씩 최대 5페이지 훑는 선형
 * 탐색이었다 — 1,000명을 넘긴 계정은 "없는 사용자" 가 되어 재발송·재설정이
 * 조용히 실패한다. 순서를 바꿨다:
 *   1) app_users.supabase_user_id (가입 때 기록, 20260905 마이그레이션이 백필)
 *      → admin.getUserById — O(1)
 *   2) public.auth_user_id_by_email(p_email) — auth.users 를 읽는 security definer
 *      함수(anon·authenticated 실행 권한 회수, service_role 만) — O(log n)
 *   3) listUsers 선형 탐색 — 마이그레이션이 안 된 배포의 최후 폴백
 */
export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const target = email.trim().toLowerCase();
  if (!target.includes("@")) return null;

  /* 1) app_users 에 기록된 auth user id */
  try {
    const { data, error } = await sb
      .from("app_users")
      .select("supabase_user_id")
      .eq("email", target)
      .maybeSingle();
    const id = !error && data ? (data as { supabase_user_id?: string | null }).supabase_user_id : null;
    if (id) {
      const { data: byId, error: byIdErr } = await sb.auth.admin.getUserById(id);
      if (!byIdErr && byId.user && (byId.user.email ?? "").toLowerCase() === target) {
        return byId.user;
      }
    }
  } catch {
    /* 컬럼이 없는 배포 — 아래 단계로 */
  }

  /* 2) auth.users 조회 함수 */
  try {
    const { data, error } = await sb.rpc("auth_user_id_by_email", { p_email: target });
    if (!error && typeof data === "string" && data) {
      const { data: byId, error: byIdErr } = await sb.auth.admin.getUserById(data);
      if (!byIdErr && byId.user) return byId.user;
    }
  } catch {
    /* 함수가 없는 배포 — 아래 단계로 */
  }

  /* 3) 선형 탐색 폴백 (상한 5페이지 × 200명) */
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      logger.warn("[find-auth-user] listUsers 실패", error.message);
      return null;
    }
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}
