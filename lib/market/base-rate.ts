import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";

/**
 * 한국은행 기준금리 읽기 (ECOS 캐시). 미연동·실패 시 null → 화면은 "—".
 */

export type BaseRate = {
  /** 표시용 (예: "2.50%") */
  label: string;
  value: number;
  /** 기준 시점 YYYYMM 또는 YYYYMMDD */
  cycle: string | null;
};

export async function getBaseRate(): Promise<BaseRate | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("public_data_cache")
      .select("payload")
      .eq("cache_key", "ecos:base-rate")
      .maybeSingle();
    if (error || !data) return null;
    const p = data.payload as { value?: string; cycle?: string } | null;
    const raw = p?.value ? Number(String(p.value).replace(/[^0-9.]/g, "")) : NaN;
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return {
      label: `${raw.toFixed(2)}%`,
      value: raw,
      cycle: p?.cycle ?? null,
    };
  } catch (e) {
    logger.error("[getBaseRate]", e);
    return null;
  }
}
