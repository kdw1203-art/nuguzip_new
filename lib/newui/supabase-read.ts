/**
 * 읽기 전용 Supabase 클라이언트 헬퍼 (새 UI 데이터 로더 전용).
 *
 * - Service Role 키가 있으면 그대로 사용 (서버 환경, RLS 우회)
 * - 없으면 publishable/anon 키로 폴백 — public read 정책이 열린 테이블
 *   (board_posts published, market_price_indices, market_region_monthly 등)은
 *   anon 키로도 조회 가능하다.
 * - 어떤 키도 없으면 null. 이 모듈로는 절대 쓰기 하지 않는다.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";

let _anon: SupabaseClient | null | undefined;

function getAnonSupabase(): SupabaseClient | null {
  if (_anon !== undefined) return _anon;
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    _anon = null;
    return null;
  }
  _anon = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _anon;
}

/** Service Role 우선, 없으면 anon — 조회 전용. */
export function getReadOnlySupabase(): SupabaseClient | null {
  return getServiceSupabase() ?? getAnonSupabase();
}
