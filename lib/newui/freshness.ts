/**
 * 데이터 신선도 라벨 (#21) — market_ingest_log 최근 성공 시각.
 *
 * - 성공값은 1h 인메모리 캐시, 실패는 60s 뒤 재시도
 * - 이 모듈은 절대 쓰기 하지 않는다.
 *
 * ── 실패를 캐시에 눌러앉히지 않는다 ────────────────────────────────────
 * 예전에는 성공이든 실패든 결과를 그대로 1시간 캐시했다. 조회가 한 번
 * 흔들리면 `value = null` 이 1시간 동안 굳어, 그동안 **모든** 방문자에게
 * `실거래 기준: …` 캡션이 사라졌다. 캡션이 없으면 옆의 숫자는 기준시점 없는
 * 숫자가 된다 — 없는 안내보다 나쁜 게 아니라, 숫자 쪽이 근거를 잃는다.
 *
 * 그래서 둘을 나눈다: **마지막 성공값**과 **마지막 시도 시각**. 실패하면
 * 마지막 성공값을 계속 쓰고 60초 뒤 다시 시도한다. 그 값은 "우리가 아는
 * 마지막 성공 적재일"이라 여전히 사실이고, 새 적재를 최대 1분 늦게 반영할 뿐이다.
 * 성공값이 한 번도 없으면 종전대로 null(캡션 미표시).
 */
import "server-only";
import { getReadOnlySupabase } from "./supabase-read";

const TTL_MS = 3600_000; // 성공값 1h
const RETRY_MS = 60_000; // 실패 후 재시도 간격

/** 마지막 **시도**. ok=false 면 value 는 아래 lastGood 을 그대로 실어 나른다. */
let cache: { at: number; value: string | null; ok: boolean } | undefined;
/** 마지막 **성공**값. 실패가 이어져도 지워지지 않는다(연속 실패에 물려 유실되지 않게). */
let lastGood: string | null = null;

/**
 * market_ingest_log에서 status=ok 최신 created_at을 "YYYY.MM.DD"로 반환.
 * 페이지에서는 `실거래 기준: {label} (국토교통부)` 캡션으로 사용한다.
 */
export async function getMarketFreshnessDateLabel(): Promise<string | null> {
  const age = cache ? Date.now() - cache.at : Infinity;
  if (cache && age < (cache.ok ? TTL_MS : RETRY_MS)) return cache.value;

  let value: string | null = null;
  try {
    const sb = getReadOnlySupabase();
    if (sb) {
      const { data, error } = await sb
        .from("market_ingest_log")
        .select("created_at")
        .eq("status", "ok")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!error && data && data.length > 0) {
        const d = new Date(String(data[0].created_at));
        if (!Number.isNaN(d.getTime())) {
          const p = (n: number) => String(n).padStart(2, "0");
          value = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
        }
      }
    }
  } catch {
    value = null;
  }

  if (value !== null) {
    lastGood = value;
    cache = { at: Date.now(), value, ok: true };
    return value;
  }

  /* 실패(또는 적재 이력 0건). 마지막 성공값이 있으면 그걸 계속 쓰고,
     시도 시각만 갱신해 60초 뒤 다시 묻는다. */
  cache = { at: Date.now(), value: lastGood, ok: false };
  return lastGood;
}
