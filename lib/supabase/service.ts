import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/supabase/flags";
import { makeResilientFetch } from "@/lib/supabase/resilient-fetch";

let _admin: SupabaseClient | null | undefined;

/** 이 클라이언트의 **읽기** 상한(ms). SUPABASE_SERVICE_READ_TIMEOUT_MS 로 조정. */
function serviceReadTimeoutMs(): number {
  const raw = Number(process.env.SUPABASE_SERVICE_READ_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 1000 && raw <= 120_000) return raw;
  return 20_000;
}

/**
 * 서버(Route Handler 등) 전용. Service Role은 클라이언트에 노출하지 마세요.
 *
 * 2026-07-26: 이 클라이언트에는 상한이 전혀 없었다. DB 가 밀리면 /map · / ·
 * /town · 사이트맵 · 크론이 300초를 통째로 태우고 `Vercel Runtime Timeout Error`
 * 로 죽었다(하루 107건). 이제 **읽기에만** 상한과 503 재시도를 건다 —
 * 쓰기(POST/PATCH/DELETE)는 멱등하지 않으므로 손대지 않는다.
 */
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
    global: { fetch: makeResilientFetch({ timeoutMs: serviceReadTimeoutMs() }) },
  });
  return _admin;
}
