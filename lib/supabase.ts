import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 클라이언트 (브라우저/서버 공용, anon key 기반)
 * .env.local 에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를
 * 넣으면 활성화됩니다. 키가 없으면 null — 화면은 목업 데이터로 동작합니다.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = Boolean(supabase);
