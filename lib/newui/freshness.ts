/**
 * 데이터 신선도 라벨 (#21) — market_ingest_log 최근 성공 시각.
 *
 * - 1h 인메모리 캐시, 조회 실패·데이터 없음 시 null (캡션 미표시)
 * - 이 모듈은 절대 쓰기 하지 않는다.
 */
import "server-only";
import { getReadOnlySupabase } from "./supabase-read";

const TTL_MS = 3600_000; // 1h

let cache: { at: number; value: string | null } | undefined;

/**
 * market_ingest_log에서 status=ok 최신 created_at을 "YYYY.MM.DD"로 반환.
 * 페이지에서는 `실거래 기준: {label} (국토교통부)` 캡션으로 사용한다.
 */
export async function getMarketFreshnessDateLabel(): Promise<string | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

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

  cache = { at: Date.now(), value };
  return value;
}
