import { getServiceSupabase } from "@/lib/supabase/service";
import { normalizePlan, type AppPlan } from "@/lib/billing/plan";
import type { UserRole } from "@/lib/auth/types";
import {
  refreshTossToken,
  removeTossByUserKey,
  type TossLoginProfile,
  type TossTokenResult,
} from "@/lib/auth/toss-login-api";
import { logger } from "@/lib/log";

/**
 * 토스 로그인 userKey ↔ app_users 매핑 + 토큰 보관 (서버 전용).
 * @see supabase/migrations/046_toss_login_link.sql
 *
 * - 이메일 동의가 없는 토스 사용자는 합성 이메일(`toss_<userKey>@toss.nuguzip.local`)로
 *   app_users 행을 만들어 기존 email 기반 role/plan 로직을 그대로 재사용합니다.
 * - 토스로만 가입한 계정은 비밀번호 로그인이 불가능하도록 sentinel password_hash 를 둡니다.
 */

/** 토스로만 가입한 계정의 password_hash sentinel (bcrypt 비교에 절대 매칭되지 않음). */
const TOSS_PASSWORD_SENTINEL = "toss-login-no-password";

export type TossLinkResult = { email: string; role: UserRole; plan: AppPlan };

/**
 * 계정 조회/생성 자체가 실패했을 때 던지는 에러.
 *
 * 예전에는 app_users 조회 실패를 "그런 계정 없음"으로 흘려보냈다. 그러면 이미
 * 관리자이거나 유료 플랜인 사람이 DB 가 잠깐 흔들리는 동안 토스로 로그인했을 때
 * role:"user" · plan:"free" 로 세션이 만들어진다 — 그 사람의 권한과 결제 상태에
 * 대한 거짓 진술이고, 화면에는 "구독하기"가 뜬다. 못 읽었으면 로그인을 내주지
 * 않는 편이 사실에 가깝다(auth.ts 가 null 을 돌려 "다시 시도"로 이어진다).
 */
export class TossLinkUnavailableError extends Error {
  constructor(where: string, message?: string) {
    super(`${where} 조회 실패: ${message ?? "알 수 없는 오류"}`);
    this.name = "TossLinkUnavailableError";
  }
}

/** 이메일 동의가 없을 때 사용할 앱 내부 식별용 합성 이메일. */
export function synthTossEmail(userKey: number): string {
  return `toss_${userKey}@toss.nuguzip.local`;
}

function normalizeRole(v: unknown): UserRole {
  return v === "admin" ? "admin" : "user";
}

async function storeTossTokens(
  userKey: number,
  tokens: TossTokenResult,
): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
  const { error } = await sb.from("toss_login_tokens").upsert(
    {
      user_key: userKey,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: tokens.tokenType || "Bearer",
      scope: tokens.scope || null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_key" },
  );
  if (error) logger.warn("[toss-login] store tokens failed", error);
}

/**
 * 토스 프로필 + 토큰을 app_users / toss_login_tokens 에 영구 반영.
 * Supabase 미설정이거나 실패해도 로그인 자체는 막지 않도록 best-effort 로 동작합니다.
 */
export async function linkTossUser(
  profile: TossLoginProfile,
  tokens: TossTokenResult,
): Promise<TossLinkResult> {
  const email =
    profile.email?.trim().toLowerCase() || synthTossEmail(profile.userKey);
  const sb = getServiceSupabase();
  if (!sb) return { email, role: "user", plan: "free" };

  try {
    // 1) userKey 로 기존 연동 행 우선 조회, 없으면 email 로 조회(소셜/비번 계정과 동일인 연결).
    let existing: {
      id: string;
      email: string;
      role: string | null;
      plan: string | null;
      name: string | null;
    } | null = null;

    {
      const { data, error } = await sb
        .from("app_users")
        .select("id, email, role, plan, name")
        .eq("toss_user_key", profile.userKey)
        .maybeSingle();
      if (error) throw new TossLinkUnavailableError("app_users (toss_user_key)", error.message);
      existing = data ?? null;
    }
    if (!existing) {
      const { data, error } = await sb
        .from("app_users")
        .select("id, email, role, plan, name")
        .eq("email", email)
        .maybeSingle();
      if (error) throw new TossLinkUnavailableError("app_users (email)", error.message);
      existing = data ?? null;
    }

    const now = new Date().toISOString();

    if (existing) {
      const { error } = await sb
        .from("app_users")
        .update({
          toss_user_key: profile.userKey,
          toss_ci: profile.ci ?? null,
          toss_linked_at: now,
          toss_unlinked_at: null,
          name: existing.name ?? profile.name ?? null,
        })
        .eq("id", existing.id);
      if (error) logger.warn("[toss-login] link update failed", error);
      await storeTossTokens(profile.userKey, tokens);
      return {
        email: existing.email,
        role: normalizeRole(existing.role),
        plan: normalizePlan(existing.plan),
      };
    }

    const { error } = await sb.from("app_users").insert({
      email,
      password_hash: TOSS_PASSWORD_SENTINEL,
      name: profile.name ?? null,
      role: "user",
      plan: "free",
      toss_user_key: profile.userKey,
      toss_ci: profile.ci ?? null,
      toss_linked_at: now,
    });
    /* 생성이 실패했는데 free 계정인 척 세션을 내주면, 다음 로그인에서 또 없는
       계정이 되고 그동안의 활동은 어디에도 붙지 않는다. 실패는 실패로 돌린다. */
    if (error) throw new TossLinkUnavailableError("app_users (생성)", error.message);
    await storeTossTokens(profile.userKey, tokens);
    return { email, role: "user", plan: "free" };
  } catch (e) {
    if (e instanceof TossLinkUnavailableError) throw e;
    logger.warn("[toss-login] linkTossUser error", e);
    return { email, role: "user", plan: "free" };
  }
}

/** 연결 해제 — app_users 에 해제 시각 기록 + 보관 토큰 삭제(토스 측은 이미 해제된 상태). */
export async function unlinkTossUser(userKey: number): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) return;
  try {
    await sb
      .from("app_users")
      .update({ toss_unlinked_at: new Date().toISOString() })
      .eq("toss_user_key", userKey);
    await sb.from("toss_login_tokens").delete().eq("user_key", userKey);
  } catch (e) {
    logger.warn("[toss-login] unlinkTossUser error", e);
  }
}

/**
 * 보관된 AccessToken 반환. 만료(또는 임박)면 refreshToken 으로 재발급해 갱신 후 반환.
 * 토큰이 없거나 재발급 불가하면 null.
 */
export async function getValidTossAccessToken(
  userKey: number,
): Promise<string | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("toss_login_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_key", userKey)
    .maybeSingle();
  if (error || !data) return null;

  const expiresAt = new Date(data.expires_at as string).getTime();
  if (Number.isFinite(expiresAt) && Date.now() < expiresAt - 60_000) {
    return data.access_token as string;
  }

  try {
    const refreshed = await refreshTossToken(data.refresh_token as string);
    await storeTossTokens(userKey, refreshed);
    return refreshed.accessToken;
  } catch (e) {
    logger.warn("[toss-login] token refresh failed", e);
    return (data.access_token as string) ?? null;
  }
}

/**
 * 서비스 측에서 토스 연동을 해제(회원 탈퇴 등) — userKey 로 remove API 호출 후 로컬 정리.
 * 토스앱 발(콜백) 해제와 달리, 우리가 먼저 끊을 때 사용합니다.
 */
export async function revokeTossUserByUserKey(userKey: number): Promise<void> {
  const token = await getValidTossAccessToken(userKey);
  if (token) {
    try {
      await removeTossByUserKey(token, userKey);
    } catch (e) {
      logger.warn("[toss-login] removeTossByUserKey failed", e);
    }
  }
  await unlinkTossUser(userKey);
}
