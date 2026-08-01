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
 * 재시도·백오프까지 합친 읽기 한 건의 **총** 상한(ms).
 *
 * ── 왜 시도별 상한만으로는 모자랐나 (2026-08-01 감사) ────────────────────────
 * 이 파일은 시도별 상한(20s)만 넘기고 totalBudgetMs 를 빠뜨렸다. 그 결과
 * 503/504 가 이어지면 읽기 한 건이 20s × 3회 + 백오프 1.2s = **61.2초**까지
 * 걸렸고, 직렬 조회 5건이면 306초 — 함수 상한 300초를 넘는다. 최근 6주
 * 런타임 오류 1,624건 중 802건이 이 경로의 300초 타임아웃이었다.
 *
 * lib/newui/supabase-read.ts 와 같은 규칙을 쓴다: 빌드 중에는 짧게(페이지
 * prerender 예산 안에서 실패가 화면에 드러나도록), 런타임은 45초. 어느 쪽이든
 * 최소 한 시도는 온전히 돌 수 있게 시도별 상한 + 1초를 하한으로 둔다.
 * 총 예산이 다하면 읽기는 **실패**하고, 호출부는 그것을 "조회 실패"로
 * 표시한다 — "데이터 없음"으로 위장하지 않는다.
 */
function serviceReadTotalBudgetMs(): number {
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const base = isBuild ? 20_000 : 45_000;
  return Math.max(base, serviceReadTimeoutMs() + 1_000);
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
    global: {
      fetch: makeResilientFetch({
        timeoutMs: serviceReadTimeoutMs(),
        totalBudgetMs: serviceReadTotalBudgetMs(),
      }),
    },
  });
  return _admin;
}
