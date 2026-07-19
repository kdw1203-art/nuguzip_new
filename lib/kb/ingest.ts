/** KB부동산 시계열 Excel → market_* 적재 (source="kb"). */
import ExcelJS from "exceljs";
import { logger } from "@/lib/log";
import { upsertSeries, upsertRegionPrices, logIngest } from "@/lib/market/store";
import type { MarketSeriesRow, MarketRegionPriceRow } from "@/lib/market/types";
import { parseKbSheet, type KbSheetConfig } from "./parse";

const WEEKLY_SHEETS: KbSheetConfig[] = [
  { sheet: "1.매매증감", periodType: "weekly", metric: "sale_change" },
  { sheet: "2.전세증감", periodType: "weekly", metric: "jeonse_change" },
  { sheet: "3.매매지수", periodType: "weekly", metric: "sale_index" },
  { sheet: "4.전세지수", periodType: "weekly", metric: "jeonse_index" },
  { sheet: "5.매수우위", periodType: "weekly", metric: "buy_superiority" },
  { sheet: "7.전세수급", periodType: "weekly", metric: "jeonse_supply" },
];

const MONTHLY_HOUSING_SHEETS: KbSheetConfig[] = [
  { sheet: "2.매매APT", periodType: "monthly", metric: "sale_index" },
  { sheet: "6.전세APT", periodType: "monthly", metric: "jeonse_index" },
  { sheet: "21.매수우위", periodType: "monthly", metric: "buy_superiority" },
  { sheet: "23.전세수급", periodType: "monthly", metric: "jeonse_supply" },
  { sheet: "28.아파트매매전세비", periodType: "monthly", metric: "jeonse_ratio" },
  { sheet: "47.㎡당아파트평균매매", periodType: "monthly", priceField: "perM2Sale", scale: 10_000 },
  { sheet: "48.㎡당아파트평균전세", periodType: "monthly", priceField: "avgJeonse", scale: 10_000 },
];

export interface KbIngestResult {
  ok: boolean;
  skipped?: boolean;
  kind?: "weekly" | "monthly-housing";
  seriesRows: number;
  priceRows: number;
}

function yyyymm(periodDate: string): string {
  return periodDate.replace(/-/g, "").slice(0, 6);
}

export async function ingestKbWorkbook(buffer: ArrayBuffer | Buffer): Promise<KbIngestResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const isWeekly = Boolean(wb.getWorksheet("1.매매증감"));
  const isMonthlyHousing = Boolean(wb.getWorksheet("2.매매APT"));
  if (!isWeekly && !isMonthlyHousing) {
    await logIngest({ source: "kb", dataset: "unknown", origin: "upload", rows: 0, status: "skipped", message: "지원하지 않는 KB 시계열 형식" });
    return { ok: false, skipped: true, seriesRows: 0, priceRows: 0 };
  }

  const configs = isWeekly ? WEEKLY_SHEETS : MONTHLY_HOUSING_SHEETS;
  const kind = isWeekly ? "weekly" : "monthly-housing";
  const allSeries: MarketSeriesRow[] = [];
  type PriceAcc = { regionName: string; period: string } & Partial<
    Record<"perM2Sale" | "avgSale" | "medianSale" | "avgJeonse", number>
  >;
  const priceAcc = new Map<string, PriceAcc>();
  const monthlyByKey = new Map<string, Array<{ period: string; value: number }>>();

  for (const cfg of configs) {
    const ws = wb.getWorksheet(cfg.sheet);
    if (!ws) continue;
    let rows: ReturnType<typeof parseKbSheet>;
    try {
      rows = parseKbSheet(ws, cfg);
    } catch (err) {
      logger.warn(`[kb.ingest] ${cfg.sheet} parse failed`, err);
      continue;
    }
    for (const r of rows) {
      if (cfg.metric) {
        allSeries.push({
          source: "kb",
          regionId: r.region.id,
          regionName: r.region.name,
          level: "sigungu",
          propertyType: "apt",
          metric: cfg.metric,
          periodType: cfg.periodType,
          period: r.period,
          value: r.value,
        });
        if (cfg.periodType === "monthly") {
          const key = `${r.region.id}|${cfg.metric}`;
          const arr = monthlyByKey.get(key) ?? [];
          arr.push({ period: r.period, value: r.value });
          monthlyByKey.set(key, arr);
        }
      }
      if (cfg.priceField) {
        const cur = priceAcc.get(r.region.id);
        if (!cur || r.period > cur.period) {
          const next = cur && r.period === cur.period ? cur : { regionName: r.region.name, period: r.period };
          priceAcc.set(r.region.id, { ...next, [cfg.priceField]: r.value });
        } else if (r.period === cur.period) {
          cur[cfg.priceField] = r.value;
        }
      }
    }
  }

  const seriesRows = await upsertSeries(allSeries);

  let priceRows = 0;
  if (isMonthlyHousing) {
    const latestMonthly = (regionId: string, metric: string): number | undefined => {
      const arr = monthlyByKey.get(`${regionId}|${metric}`);
      if (!arr || arr.length === 0) return undefined;
      arr.sort((a, b) => a.period.localeCompare(b.period));
      return arr[arr.length - 1]?.value;
    };
    const monthlyChange = (regionId: string): number | undefined => {
      const arr = monthlyByKey.get(`${regionId}|sale_index`);
      if (!arr || arr.length < 2) return undefined;
      arr.sort((a, b) => a.period.localeCompare(b.period));
      const cur = arr[arr.length - 1].value;
      const prev = arr[arr.length - 2].value;
      return prev ? Math.round(((cur - prev) / prev) * 10000) / 100 : undefined;
    };

    const regionIds = new Set<string>([...priceAcc.keys()]);
    for (const key of monthlyByKey.keys()) regionIds.add(key.split("|")[0]);

    const priceRowsArr: MarketRegionPriceRow[] = [];
    for (const regionId of regionIds) {
      const price = priceAcc.get(regionId);
      const periodDate = price?.period ?? monthlyByKey.get(`${regionId}|sale_index`)?.slice(-1)[0]?.period ?? "";
      const regionName = price?.regionName ?? allSeries.find((s) => s.regionId === regionId)?.regionName ?? regionId;
      priceRowsArr.push({
        source: "kb",
        regionId,
        regionName,
        propertyType: "apt",
        period: periodDate ? yyyymm(periodDate) : "",
        perM2Sale: price?.perM2Sale,
        avgJeonse: price?.avgJeonse,
        jeonseRatio: latestMonthly(regionId, "jeonse_ratio"),
        saleChange: monthlyChange(regionId),
        buySuperiority: latestMonthly(regionId, "buy_superiority"),
        jeonseSupply: latestMonthly(regionId, "jeonse_supply"),
      });
    }
    priceRows = await upsertRegionPrices(priceRowsArr);
  }

  await logIngest({
    source: "kb",
    dataset: kind,
    origin: "upload",
    rows: seriesRows + priceRows,
    status: "ok",
    message: `series=${seriesRows} price=${priceRows}`,
  });

  return { ok: true, kind, seriesRows, priceRows };
}
