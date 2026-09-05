import { normalizePlan, type AppPlan } from "@/lib/billing/plan";
import type { UserRole } from "@/lib/auth/types";

export type AppUserProfile = {
  role: UserRole;
  plan: AppPlan;
  /** [965] 제재 중(is_banned 이고 ban_until 이 없거나 미래) — 세션을 내주지 않는다 */
  banned: boolean;
};

export type AppUserProfileRow = {
  role?: string | null;
  plan?: string | null;
  plan_expires_at?: string | null;
  is_banned?: boolean | null;
  ban_until?: string | null;
};

/**
 * [965] 만료·제재를 **읽는 시점에** 적용한다.
 *
 * 예전에는 `role, plan` 만 읽었다. `plan_expires_at` 은 하루 한 번 도는
 * plan-expiry-sweep 크론이 free 로 내려 줄 때까지 무시됐고 — 7일 주간권이
 * 오후 4시에 끝나도 다음 날 스윕(15:00 KST)까지 최대 23시간 유료 티어가 유지됐다.
 * `is_banned` 는 관리자 화면이 세우긴 하는데 **로그인 어디에서도 보지 않았다**.
 * 제재가 곧 로그인 차단이어야 관리자 조치가 조치다. 크론은 정리(행 갱신·메일)만 맡고,
 * 권한 판정은 여기서 끝낸다.
 */
export function resolveProfileRow(
  row: AppUserProfileRow,
  now: Date = new Date(),
): AppUserProfile {
  const role: UserRole = row.role === "admin" ? "admin" : "user";
  let plan = normalizePlan(row.plan ?? undefined);
  const exp = row.plan_expires_at ? Date.parse(row.plan_expires_at) : NaN;
  if (Number.isFinite(exp) && exp <= now.getTime()) plan = "free";
  const until = row.ban_until ? Date.parse(row.ban_until) : NaN;
  const banned =
    Boolean(row.is_banned) && (!Number.isFinite(until) || until > now.getTime());
  return { role, plan, banned };
}

