/** KOSIS Open API → market_region_series 적재 (보조지표). */
import { logger } from "@/lib/log";
import { upsertSeries, logIngest } from "@/lib/market/store";
import type { MarketSeriesRow } from "@/lib/market/types";
import { KOSIS_TABLES } from "./stat-tables";
import { fetchKosisTable, isKosisConfigured } from "./client";

export interface KosisIngestResult {
  ok: boolean;
  skipped?: boolean;
  seriesRows: number;
  byTable: Record<string, number>;
  message?: string;
}

/** KOSIS PRD_DE(yyyymm | yyyy) → YYYY-MM-DD */
function periodToDate(prd: string): string {
  if (/^\d{6}$/.test(prd)) return `${prd.slice(0, 4)}-${prd.slice(4, 6)}-01`;
  if (/^\d{4}$/.test(prd)) return `${prd}-01-01`;
  return prd;
}

export async function ingestKosis(
  opts: { recentCount?: number } = {},
): Promise<KosisIngestResult> {
  if (!isKosisConfigured()) {
    await logIngest({ source: "kosis", dataset: "all", origin: "api", rows: 0, status: "skipped", message: "KOSIS_API_KEY 미설정" });
    return { ok: false, skipped: true, seriesRows: 0, byTable: {} };
  }

  const allSeries: MarketSeriesRow[] = [];
  const byTable: Record<string, number> = {};

  for (const table of KOSIS_TABLES) {
    let rows: Awaited<ReturnType<typeof fetchKosisTable>> = [];
    try {
      rows = await fetchKosisTable(table, opts);
    } catch (err) {
      logger.warn(`[kosis.ingest] ${table.label} failed`, err);
      byTable[table.label] = 0;
      continue;
    }
    byTable[table.label] = rows.length;
    const periodType = table.prdSe === "M" ? "monthly" : "monthly"; // 시계열 저장은 monthly로 통일(연간=1월1일)
    for (const r of rows) {
      allSeries.push({
        source: "kosis",
        regionId: r.region.id,
        regionName: r.region.name,
        level: "sigungu",
        propertyType: "apt", // 지역 단위 보조지표 — property_type 은 중립 placeholder
        metric: table.metric,
        periodType,
        period: periodToDate(r.period),
        value: r.value,
      });
    }
  }

  const seriesRows = await upsertSeries(allSeries);
  const empty = Object.entries(byTable).filter(([, n]) => n === 0).map(([k]) => k);
  await logIngest({
    source: "kosis",
    dataset: "인구·세대·미분양·주택보급률",
    origin: "api",
    rows: seriesRows,
    status: seriesRows > 0 ? "ok" : "skipped",
    message:
      `series=${seriesRows} ` +
      Object.entries(byTable).map(([k, v]) => `${k}:${v}`).join(" ") +
      (empty.length ? ` · 0건(키 활성화/표ID 확인 필요): ${empty.join(",")}` : ""),
  });

  return {
    ok: seriesRows > 0,
    seriesRows,
    byTable,
    message: empty.length
      ? `일부 표 0건 — 인증키 활성화 또는 통계표 ID 확인 필요(${empty.join(", ")})`
      : undefined,
  };
}
