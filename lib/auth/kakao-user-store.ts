import { normalizePlan, type AppPlan } from "@/lib/billing/plan";
import type { UserRole } from "@/lib/auth/types";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/** 카카ao-only 계정 — 비밀번호 로그인 불가 sentinel */
const KAKAO_PASSWORD_SENTINEL = "kakao-oauth-no-password";

export type KakaoLinkResult = {
  email: string;
  role: UserRole;
  plan: AppPlan;
  isNew: boolean;
};

export function synthKakaoEmail(kakaoUserId: string): string {
  return `kakao_${kakaoUserId}@kakao.nuguzip.local`;
}

function normalizeRole(v: unknown): UserRole {
  return v === "admin" ? "admin" : "user";
}

type KakaoProfilePayload = {
  kakaoUserId: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

/**
 * NextAuth 카카오 로그인 직후 app_users upsert (best-effort).
 * @see supabase/migrations/054_kakao_oauth_link.sql
 */
export async function linkKakaoUser(
  input: KakaoProfilePayload,
): Promise<KakaoLinkResult> {
  const kakaoUserId = input.kakaoUserId.trim();
  const email =
    input.email?.trim().toLowerCase() || synthKakaoEmail(kakaoUserId);
  const sb = getServiceSupabase();
  if (!sb) {
    return { email, role: "user", plan: "free", isNew: true };
  }

  const now = new Date().toISOString();
  let isNew = false;

  try {
    /* error 를 삼키면 "이 카카오 계정은 처음 본다"가 되고, 아래 insert 가
       기존 계정과 충돌하거나 새 행을 또 만든다. 못 읽었으면 그렇게 말한다. */
    const { data: byKakao, error: byKakaoError } = await sb
      .from("app_users")
      .select("id, email, role, plan, name, avatar_url")
      .eq("kakao_user_id", kakaoUserId)
      .maybeSingle();
    if (byKakaoError) {
      logger.error("[kakao-login] app_users(kakao_user_id) 조회 실패", byKakaoError.message);
      throw new Error(
        `app_users 조회 실패 (kakao_user_id): ${byKakaoError.message ?? "알 수 없는 오류"}`,
      );
    }

    let row = byKakao;

    if (!row && input.email) {
      const { data: byEmail, error: byEmailError } = await sb
        .from("app_users")
        .select("id, email, role, plan, name, avatar_url")
        .eq("email", email)
        .maybeSingle();
      if (byEmailError) {
        logger.error("[kakao-login] app_users(email) 조회 실패", byEmailError.message);
        throw new Error(
          `app_users 조회 실패 (email): ${byEmailError.message ?? "알 수 없는 오류"}`,
        );
      }
      row = byEmail;
    }

    if (row) {
      const { error } = await sb
        .from("app_users")
        .update({
          kakao_user_id: kakaoUserId,
          kakao_linked_at: now,
          updated_at: now,
          ...(input.name && !row.name ? { name: input.name } : {}),
          ...(input.image && !row.avatar_url ? { avatar_url: input.image } : {}),
        })
        .eq("id", row.id);
      /* 갱신 실패는 "카카오 연동이 안 붙었다"는 뜻이라 다음 로그인 때 이 사람을
         또 신규로 본다. 조용히 넘기지 않고 error 로 남긴다. */
      if (error) logger.error("[kakao-login] 연동 갱신 실패", error.message);
      return {
        email: String(row.email),
        role: normalizeRole(row.role),
        plan: normalizePlan(row.plan as string | undefined),
        isNew: false,
      };
    }

    isNew = true;
    const { error: insertError } = await sb.from("app_users").insert({
      email,
      password_hash: KAKAO_PASSWORD_SENTINEL,
      name: input.name ?? email.split("@")[0] ?? "카카오 회원",
      role: "user",
      plan: "free",
      avatar_url: input.image,
      kakao_user_id: kakaoUserId,
      kakao_linked_at: now,
      updated_at: now,
    });
    /* 여기서 실패하면 로그인은 됐는데 계정 행이 없는 상태가 된다 —
       가장 조용한 고장이다. error 로 남겨 눈에 띄게 한다. */
    if (insertError) {
      logger.error("[kakao-login] 계정 생성 실패", insertError.message);
      isNew = false;
    }
  } catch (e) {
    logger.error("[kakao-login] linkKakaoUser", e);
  }

  return { email, role: "user", plan: "free", isNew };
}

/** NextAuth Kakao profile / account 에서 link 입력 추출 */
export function parseKakaoSignInPayload(input: {
  accountProviderAccountId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  userImage?: string | null;
  profile?: unknown;
}): KakaoProfilePayload | null {
  const kakaoUserId = input.accountProviderAccountId?.trim();
  if (!kakaoUserId) return null;

  let email = input.userEmail?.trim().toLowerCase() || null;
  let name = input.userName?.trim() || null;
  let image = input.userImage?.trim() || null;

  const p = input.profile as Record<string, unknown> | undefined;
  const account = p?.kakao_account as Record<string, unknown> | undefined;
  if (account) {
    if (!email && typeof account.email === "string") {
      email = account.email.trim().toLowerCase();
    }
    const prof = account.profile as Record<string, unknown> | undefined;
    if (prof) {
      if (!name && typeof prof.nickname === "string") name = prof.nickname;
      if (!image && typeof prof.profile_image_url === "string") {
        image = prof.profile_image_url;
      }
    }
  }

  return { kakaoUserId, email, name, image };
}
