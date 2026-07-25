import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/**
 * 실거래 집계 머티리얼라이즈드 뷰 갱신.
 *
 * ── 왜 집계를 미리 계산해 두는가 ────────────────────────────────────────────
 * `tx_band_landing_source` · `tx_band_complex_source` · `map_price_point_source`
 * 는 원래 뷰였고, 매 요청마다 `market_transactions`(68,126행) 전체를 seq scan 하며
 * GROUP BY / percentile_cont / count(DISTINCT) 를 다시 계산했다. 실측값:
 *
 *   · 지도 집계   1,636ms (warm, shared-hit 12,194 buffers) — 지도를 한 칸 움직일
 *                 때마다 이 비용이 다시 든다
 *   · 밴드 집계   anon 의 statement_timeout(3초)을 넘겨 아예 취소됨
 *
 * 그래서 운영에서 두 가지가 조용히 깨져 있었다.
 *   1) `/tx` 빌드 프리렌더가 빈 배열을 받아 "실거래 데이터를 불러오지 못했습니다"가
 *      revalidate(1시간) 내내 그대로 굳었다.
 *   2) `/api/map/clusters` 는 오류를 삼키고 `[]` 를 돌려주어 모든 마커가
 *      회색 "데이터 없음"으로 칠해졌다.
 *
 * 집계 원본은 국토부 확정 실거래이고 월 1회 인제스트로만 바뀐다. 실시간으로 다시
 * 계산할 이유가 없어, 인제스트 직후 한 번만 계산해 MV 에 담는다.
 * 뷰 이름·컬럼은 그대로 두고 본문만 `select * from <mv>` 로 바꿨기 때문에
 * 읽는 쪽 코드는 손대지 않았다.
 *
 * ── 사실 우선 ──────────────────────────────────────────────────────────────
 * MV 는 "느려서 못 읽은 값"을 지어내지 않는다. 인제스트가 넣은 실거래만 다시
 * 집계할 뿐이라 화면에 뜨는 숫자는 DB 원본과 항상 일치한다. 갱신에 실패하면
 * 직전 집계가 그대로 남는다(빈 값으로 덮어쓰지 않는다) — 오래된 값일 수는 있어도
 * 없는 값이 만들어지지는 않는다. 신선도는 `latest_ym`/`last_data_at` 으로 드러난다.
 */

export type RefreshAggregatesResult = {
  ok: boolean;
  /** 서비스 롤 키가 없어 시도조차 못 한 경우 false */
  attempted: boolean;
  durationMs?: number;
  rows?: { tx_band_landing: number; tx_band_complex: number; map_price_point: number };
  error?: string;
};

/**
 * `public.refresh_market_aggregates()` 호출.
 *
 * 이 함수는 DB 쪽에서 `REFRESH MATERIALIZED VIEW CONCURRENTLY` 를 쓴다.
 * CONCURRENTLY 라 갱신 중에도 읽기가 막히지 않고(유니크 인덱스가 있어 가능),
 * 실패하면 예외가 나면서 이전 내용이 유지된다.
 *
 * 실측 소요 8.75초. PostgREST 로 들어오는 service_role 은 authenticator 의
 * statement_timeout(8초)을 물려받으므로, DB 함수에 `SET statement_timeout='280s'`
 * 를 걸어 두었다(크론 maxDuration 300초 안에서 끝난다).
 *
 * 호출부는 이 결과로 인제스트 자체를 실패시키지 않는다. 적재는 이미 끝났고,
 * 집계 갱신은 다음 실행이나 수동 호출로 따라잡을 수 있는 후처리이기 때문이다.
 */
export async function refreshMarketAggregates(): Promise<RefreshAggregatesResult> {
  const sb = getServiceSupabase();
  if (!sb) {
    logger.warn("[market-agg] 서비스 롤 키가 없어 집계 갱신을 건너뜁니다.");
    return { ok: false, attempted: false, error: "Supabase 서비스 롤 미설정" };
  }

  const startedAt = Date.now();
  try {
    const { data, error } = await sb.rpc("refresh_market_aggregates");
    if (error) {
      logger.warn("[market-agg] 갱신 실패:", error.message);
      return { ok: false, attempted: true, durationMs: Date.now() - startedAt, error: error.message };
    }

    const payload = (data ?? {}) as {
      duration_ms?: number;
      rows?: { tx_band_landing: number; tx_band_complex: number; map_price_point: number };
    };
    const durationMs = payload.duration_ms ?? Date.now() - startedAt;
    logger.info(
      "[market-agg] 갱신 완료",
      `${durationMs}ms`,
      `landing=${payload.rows?.tx_band_landing ?? "?"}`,
      `complex=${payload.rows?.tx_band_complex ?? "?"}`,
      `map=${payload.rows?.map_price_point ?? "?"}`,
    );
    return { ok: true, attempted: true, durationMs, rows: payload.rows };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn("[market-agg] 갱신 예외:", message);
    return { ok: false, attempted: true, durationMs: Date.now() - startedAt, error: message };
  }
}
