import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* [#80] 관심단지 주간 브리핑 — 주간 다이제스트 크론에서 사용자별로 호출.
 * 관심 단지들의 최근 7일 매매 신고를 단지명 매칭으로 집계해 한 줄 요약을 만든다.
 * 활동이 0이면 null — "이번 주 소식 없음" 알림은 보내지 않는다(소음 금지).
 * complex_id 가 "alert:region:…" 형태인 지역 알림 행은 건너뛴다(가격알림 크론과
 * 같은 제외 규칙). */

export type WatchlistBrief = {
  title: string;
  body: string;
  complexCount: number;
  tradeCount: number;
};

function krwEok(v: number): string {
  const eok = v / 100_000_000;
  return eok >= 10 ? `${eok.toFixed(1)}억` : `${eok.toFixed(2)}억`;
}

export async function buildWatchlistBrief(email: string): Promise<WatchlistBrief | null> {
  const sb = getServiceSupabase();
  if (!sb || !email) return null;

  const { data: watchRows, error: watchErr } = await sb
    .from("user_watchlist")
    .select("complex_id, complex_name")
    .eq("user_email", email)
    .limit(50);
  if (watchErr) {
    logger.warn(`[watchlist-brief] 조회 실패 (${email})`, watchErr);
    return null;
  }
  const names = [
    ...new Set(
      (watchRows ?? [])
        .filter((r) => !String(r.complex_id ?? "").startsWith("alert:"))
        .map((r) => String(r.complex_name ?? "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 30);
  if (names.length === 0) return null;

  const fromYm = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const { data: txRows, error: txErr } = await sb
    .from("market_transactions")
    .select("complex_name, deal_amount_krw, created_at")
    .in("complex_name", names)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .eq("property_type", "apartment")
    .gte("contract_ym", fromYm)
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .not("deal_amount_krw", "is", null)
    .limit(500);
  if (txErr) {
    logger.warn(`[watchlist-brief] 실거래 조회 실패 (${email})`, txErr);
    return null;
  }
  const rows = (txRows ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;

  const byComplex = new Map<string, { count: number; max: number }>();
  for (const r of rows) {
    const nm = String(r.complex_name ?? "");
    const price = Number(r.deal_amount_krw) || 0;
    const cur = byComplex.get(nm) ?? { count: 0, max: 0 };
    cur.count += 1;
    if (price > cur.max) cur.max = price;
    byComplex.set(nm, cur);
  }
  const parts = [...byComplex.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([nm, v]) => `${nm} ${v.count}건(최고 ${krwEok(v.max)})`);

  return {
    title: "내 관심단지 주간 브리핑",
    body: `이번 주 새 실거래 신고 — ${parts.join(" · ")}${
      byComplex.size > 3 ? ` 외 ${byComplex.size - 3}개 단지` : ""
    }`,
    complexCount: byComplex.size,
    tradeCount: rows.length,
  };
}
