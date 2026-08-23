import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* 주간 신고가 — detect_new_price_highs RPC(p_hours=168)의 얇은 래퍼.
   [#58] 블로그 팩과 [#62] 소셜 소재가 같은 데이터를 쓴다. 실패는 throw —
   호출부가 그 섹션/소재를 접는다(없는 신고가를 지어내지 않는다). */

export type WeeklyHigh = {
  complexName: string;
  regionName: string;
  areaM2: number;
  priceKrw: number;
  priorMaxKrw: number;
  contractYm: string;
};

export async function getWeeklyPriceHighs(limit = 5): Promise<WeeklyHigh[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("detect_new_price_highs", {
    p_hours: 168,
    p_min_prior: 10,
    p_margin: 1.03,
    p_limit: limit,
  });
  if (error) {
    logger.error("[weekly-highs] RPC 실패", error);
    throw new Error(`detect_new_price_highs 실패: ${error.message}`);
  }
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({
      complexName: String(r.complex_name ?? ""),
      regionName: String(r.region_name ?? ""),
      areaM2: Number(r.area) || 0,
      priceKrw: Number(r.deal_amount_krw) || 0,
      priorMaxKrw: Number(r.prior_max) || 0,
      contractYm: String(r.contract_ym ?? ""),
    }))
    .filter((r) => r.complexName && r.priceKrw > 0);
}
