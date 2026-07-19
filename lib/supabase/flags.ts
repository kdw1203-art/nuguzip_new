import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";

/** URL + publishable/anon — 브라우저·SSR 유저 세션 */
export function isSupabaseAuthConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabasePublicKey());
}

/** Service Role + URL — 서버 전용 관리/배치 DB
 *  키 형식 검증: 마스킹 플레이스홀더("[SENSITIVE]" 등)가 저장된 환경 대비 */
export function isSupabaseConfigured(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const looksValid =
    !!key && (key.startsWith("eyJ") || key.startsWith("sb_secret_"));
  return Boolean(getSupabaseUrl() && looksValid);
}

/**
 * NextAuth 이메일·비밀번호(Credentials) 로그인 가능 여부.
 * - Service Role 있으면 app_users bcrypt 경로
 * - Publishable/anon 만 있으면 Supabase Auth `signInWithPassword` 경로
 */
export function isSupabasePasswordLoginConfigured(): boolean {
  return isSupabaseAuthConfigured() || isSupabaseConfigured();
}
