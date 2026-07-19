import { getServiceSupabase } from "@/lib/supabase/service";

export type MeProfile = {
  email: string;
  name: string | null;
  plan: "free" | "pro" | "expert";
  role: "user" | "admin";
  createdAt: string | null;
  avatarUrl?: string | null;
  /** 실거주·가족·투자 등(선택) */
  persona?: string | null;
  /** 관심 시·군·구 또는 동네 한 줄(선택) */
  primaryRegion?: string | null;
  /** 이사·투자 시점(선택) */
  intentHorizon?: string | null;
};

const PERSONA_SET = new Set(["residential", "family", "invest"]);

export function normalizePersona(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  return PERSONA_SET.has(s) ? s : null;
}

/**
 * Supabase 가 설정돼 있으면 app_users 에서 현재 사용자 프로필을 가져옵니다.
 * 설정되지 않았으면 세션 값으로만 구성.
 */
/** Supabase `app_users.id` (없으면 null). OAuth·개발용 세션은 행이 없을 수 있습니다. */
export async function getAppUserIdByEmail(
  email: string,
): Promise<string | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("app_users")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error || !data) return null;
  return (data.id as string) ?? null;
}

export async function loadMeProfile(
  email: string,
  fallback: { name?: string | null; plan?: string | null; role?: string | null } = {},
): Promise<MeProfile> {
  const base: MeProfile = {
    email,
    name: fallback.name ?? null,
    plan: (fallback.plan as MeProfile["plan"]) ?? "free",
    role: (fallback.role as MeProfile["role"]) ?? "user",
    createdAt: null,
  };
  const sb = getServiceSupabase();
  if (!sb) return base;
  const { data, error } = await sb
    .from("app_users")
    .select("email, name, plan, role, created_at, avatar_url, persona, primary_region, intent_horizon")
    .eq("email", email)
    .maybeSingle();
  if (error || !data) return base;
  return {
    email: String(data.email ?? email),
    name: (data.name as string | null) ?? base.name,
    plan:
      (data.plan as MeProfile["plan"]) ??
      (base.plan as MeProfile["plan"]),
    role:
      (data.role as MeProfile["role"]) ??
      (base.role as MeProfile["role"]),
    createdAt: (data.created_at as string | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
    persona: (data.persona as string | null) ?? null,
    primaryRegion: (data.primary_region as string | null) ?? null,
    intentHorizon: (data.intent_horizon as string | null) ?? null,
  };
}

/** 아바타 URL 업데이트 */
export async function updateAvatar(email: string, avatarUrl: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) return;
  await sb.from("app_users").update({ avatar_url: avatarUrl }).eq("email", email.trim().toLowerCase());
}

/** 이름·비밀번호 등 프로필 업데이트. */
export async function updateMeProfile(
  email: string,
  patch: { name?: string; passwordHash?: string; avatarUrl?: string },
): Promise<MeProfile | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.passwordHash !== undefined) updates.password_hash = patch.passwordHash;
  if (patch.avatarUrl !== undefined) updates.avatar_url = patch.avatarUrl;
  if (Object.keys(updates).length === 0) return loadMeProfile(email);
  const { data, error } = await sb
    .from("app_users")
    .update(updates)
    .eq("email", email.trim().toLowerCase())
    .select("email, name, plan, role, created_at")
    .maybeSingle();
  if (error || !data) return null;
  return {
    email: String(data.email ?? email),
    name: (data.name as string | null) ?? null,
    plan: (data.plan as MeProfile["plan"]) ?? "free",
    role: (data.role as MeProfile["role"]) ?? "user",
    createdAt: (data.created_at as string | null) ?? null,
  };
}

/** 가입일 기준 경과 일수 */
export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return 0;
  const diff = Date.now() - d;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}
