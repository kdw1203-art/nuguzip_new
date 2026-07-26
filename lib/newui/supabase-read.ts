/**
 * 읽기 전용 Supabase 클라이언트 헬퍼 (새 UI 데이터 로더 전용).
 *
 * - Service Role 키가 있으면 그대로 사용 (서버 환경, RLS 우회)
 * - 없으면 publishable/anon 키로 폴백 — public read 정책이 열린 테이블
 *   (board_posts published, market_price_indices, market_region_monthly 등)은
 *   anon 키로도 조회 가능하다.
 * - 어떤 키도 없으면 null. 이 모듈로는 절대 쓰기 하지 않는다.
 *
 * ── 왜 요청당 상한을 두는가 (2026-07-26 실제 사고) ───────────────────────────
 * DB 인스턴스가 CPU 에서 밀리자, 캐시에 100% 올라온 43 buffer 질의가 3.7초씩
 * 걸렸다(같은 질의 다음 번은 77ms). 그 상태에서 상한이 없으니:
 *   - 빌드의 prerender 가 페이지마다 무한정 기다렸고,
 *   - CI 의 순차 링크 크롤이 3시간 멈춰 배포가 하루 종일 안 나갔다.
 *
 * 상한이 걸리면 조회는 **실패**한다. 그게 맞다 — 각 로더는 실패를
 * "조회 실패"로 정직하게 표시하지, **"데이터 없음"이나 "준비 중"으로 위장하지
 * 않는다.** 못 읽은 것과 없는 것은 다른 사실이고, 사용자에게도 다르게 보여야 한다.
 * 무한히 기다리는 쪽은 그 선택지조차 없애 버린다.
 *
 * 이 상한은 **읽기 전용 경로에만** 건다. 쓰기에 상한을 걸면 클라이언트는
 * 끊겼는데 서버는 커밋한 애매한 상태가 생긴다 — 읽기는 그 위험이 없다.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";
import { isSupabaseConfigured } from "@/lib/supabase/flags";
import { makeResilientFetch } from "@/lib/supabase/resilient-fetch";

/** 조회 한 건의 상한(ms). SUPABASE_READ_TIMEOUT_MS 로 조정 가능. */
function readTimeoutMs(): number {
  const raw = Number(process.env.SUPABASE_READ_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 1000 && raw <= 120_000) return raw;
  return 25_000;
}

/**
 * 상한 + 503 재시도가 걸린 fetch.
 *
 * 2026-07-26: 상한만으로는 부족했다. 프로덕션 오류의 최다 항목이
 * `PGRST002 — Could not query the database for the schema cache. Retrying.`
 * (하루 106건)인데, 이건 PostgREST 가 스스로 "다시 시도하라" 고 말하는 일시적
 * 상태(HTTP 503)다. 한 번 실패했다고 사용자에게 오류를 보여줄 이유가 없다.
 * 자세한 근거는 lib/supabase/resilient-fetch.ts 주석 참고.
 */
const READ_OPTS = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: makeResilientFetch({ timeoutMs: readTimeoutMs() }) },
} as const;

let _service: SupabaseClient | null | undefined;
let _anon: SupabaseClient | null | undefined;

/* getServiceSupabase() 를 재사용하지 않고 여기서 따로 만든다.
   그쪽 클라이언트는 쓰기에도 쓰이므로 상한을 걸면 안 되기 때문이다. */
function getServiceReadSupabase(): SupabaseClient | null {
  if (_service !== undefined) return _service;
  if (!isSupabaseConfigured()) {
    _service = null;
    return null;
  }
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    _service = null;
    return null;
  }
  _service = createClient(url, key, READ_OPTS);
  return _service;
}

function getAnonSupabase(): SupabaseClient | null {
  if (_anon !== undefined) return _anon;
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    _anon = null;
    return null;
  }
  _anon = createClient(url, key, READ_OPTS);
  return _anon;
}

/** Service Role 우선, 없으면 anon — 조회 전용. */
export function getReadOnlySupabase(): SupabaseClient | null {
  return getServiceReadSupabase() ?? getAnonSupabase();
}

/** Service Role 키가 무효한 경우 대비 — anon 클라이언트 직접 접근 */
export function getAnonReadOnlySupabase(): SupabaseClient | null {
  return getAnonSupabase();
}
