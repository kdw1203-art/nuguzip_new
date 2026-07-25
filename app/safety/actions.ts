"use server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/**
 * 안전 진단 — 입력한 주소/단지명으로 market_transactions(국토부 실거래)에서
 * 최근 매매 평균가를 찾아 자가진단의 "매매 시세(추정)" 프리필에 쓴다.
 *
 * 단지명 부분일치(ilike) 기반 근사 조회다. 값을 지어내지 않는다 —
 * 매칭이 없거나 표본이 부족하면 ok:false 로 정직하게 반환하고, 성공 시에도
 * 단지명·표본 수·기간을 함께 돌려줘 화면에서 근거를 표기하게 한다.
 */

const MIN_SAMPLE = 2; // 이 미만이면 평균이라 부르지 않는다
const SAMPLE_SIZE = 6; // 평균에 쓰는 최근 거래 수 상한

export type AvgTradePriceResult =
  | {
      ok: true;
      /** 평균 매매가 (만원) */
      avgManwon: number;
      sampleSize: number;
      complexName: string;
      regionName: string;
      /** 표본 중 가장 늦은 계약월 "YYYYMM" */
      latestYm: string;
    }
  | { ok: false; reason: "empty-query" | "no-store" | "not-found" | "query-failed" };

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 검색 토큰 — 공백 분리 후 2자 이상, 긴 것 우선(단지명일 확률이 높다). */
function tokensOf(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.replace(/[%_,]/g, "").trim())
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}

export async function lookupAvgTradePrice(rawQuery: string): Promise<AvgTradePriceResult> {
  const query = (rawQuery ?? "").trim().slice(0, 80);
  const tokens = tokensOf(query);
  if (tokens.length === 0) return { ok: false, reason: "empty-query" };

  const sb = getServiceSupabase();
  if (!sb) return { ok: false, reason: "no-store" };

  try {
    for (const token of tokens) {
      const { data, error } = await sb
        .from("market_transactions")
        .select("complex_name,region_name,deal_amount_krw,contract_ym")
        .ilike("complex_name", `%${token}%`)
        .eq("transaction_type", "trade")
        .eq("is_cancelled", false)
        .eq("property_type", "apartment")
        .not("deal_amount_krw", "is", null)
        .order("contract_ym", { ascending: false })
        .limit(40);
      if (error) {
        logger.warn("[safety.avg-price] query error", error.message);
        return { ok: false, reason: "query-failed" };
      }
      const rows = (data ?? []) as Record<string, unknown>[];
      if (rows.length === 0) continue;

      // 가장 많이 매칭된 단지 하나로 좁힌다(동명 이단지 혼합 평균 방지)
      const byComplex = new Map<string, Record<string, unknown>[]>();
      for (const r of rows) {
        const key = `${String(r.complex_name ?? "")}__${String(r.region_name ?? "")}`;
        const list = byComplex.get(key) ?? [];
        list.push(r);
        byComplex.set(key, list);
      }
      const [bestKey, bestRows] = [...byComplex.entries()].sort(
        (a, b) => b[1].length - a[1].length,
      )[0];
      const sample = bestRows
        .map((r) => ({ amount: num(r.deal_amount_krw), ym: String(r.contract_ym ?? "") }))
        .filter((r): r is { amount: number; ym: string } => r.amount != null)
        .slice(0, SAMPLE_SIZE);
      if (sample.length < MIN_SAMPLE) continue;

      const avgKrw = sample.reduce((a, b) => a + b.amount, 0) / sample.length;
      const [complexName, regionName] = bestKey.split("__");
      return {
        ok: true,
        avgManwon: Math.round(avgKrw / 10_000),
        sampleSize: sample.length,
        complexName,
        regionName,
        latestYm: sample[0]?.ym ?? "",
      };
    }
    return { ok: false, reason: "not-found" };
  } catch (e) {
    logger.error("[safety.avg-price]", e);
    return { ok: false, reason: "query-failed" };
  }
}
