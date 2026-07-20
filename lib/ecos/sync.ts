import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { fetchKeyStatistics, isEcosConfigured } from "@/lib/ecos/client";
import { logger } from "@/lib/log";

/**
 * ECOS 100대 통계지표 → public_data_cache 적재.
 * cache_key = "ecos:key-stats" 에 전체를, "ecos:base-rate" 에 기준금리 요약을 저장.
 */

const CACHE_SOURCE = "ecos";

export type EcosSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  count?: number;
  baseRate?: string | null;
};

/** 기준금리 후보 이름들 (ECOS 지표명 변동 대비) */
function pickBaseRate(
  stats: { name: string; value: string; cycle: string; unit: string }[],
): { value: string; cycle: string; unit: string } | null {
  const cand = stats.find(
    (s) => s.name.includes("한국은행 기준금리") || s.name.includes("기준금리"),
  );
  return cand ? { value: cand.value, cycle: cand.cycle, unit: cand.unit } : null;
}

export async function syncEcosKeyStats(): Promise<EcosSyncResult> {
  if (!isEcosConfigured()) {
    return { ok: false, skipped: true, reason: "ECOS_API_KEY 미설정" };
  }
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, skipped: true, reason: "Supabase 미설정" };

  const stats = await fetchKeyStatistics();
  if (!stats || stats.length === 0) {
    return { ok: false, skipped: true, reason: "ECOS 응답 없음(인증키 확인)" };
  }

  const baseRate = pickBaseRate(stats);
  const now = new Date();
  const nowIso = now.toISOString();
  // public_data_cache.expires_at 은 NOT NULL — 7일 뒤 만료 (주 1회 갱신)
  const expiresIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = [
    {
      source: CACHE_SOURCE,
      cache_key: "ecos:key-stats",
      payload: { stats, fetchedAt: nowIso },
      fetched_at: nowIso,
      expires_at: expiresIso,
    },
    {
      source: CACHE_SOURCE,
      cache_key: "ecos:base-rate",
      payload: baseRate ?? {},
      fetched_at: nowIso,
      expires_at: expiresIso,
    },
  ];
  const { error } = await sb
    .from("public_data_cache")
    .upsert(rows, { onConflict: "cache_key" });
  if (error) {
    logger.error("[ecos sync] upsert failed", error);
    return { ok: false, reason: error.message };
  }
  return {
    ok: true,
    count: stats.length,
    baseRate: baseRate ? baseRate.value : null,
  };
}
