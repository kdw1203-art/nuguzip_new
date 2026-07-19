import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/supabase/flags";

let _admin: SupabaseClient | null | undefined;

/** 서버(Route Handler 등) 전용. Service Role은 클라이언트에 노출하지 마세요. */
export function getServiceSupabase(): SupabaseClient | null {
  if (_admin !== undefined) return _admin;
  if (!isSupabaseConfigured()) {
    _admin = null;
    return null;
  }
  const url = getSupabaseUrl()!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
