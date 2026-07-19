import { SeoulApiError, fetchAllSeoulRows, matchesDistrict } from "../openapi-client";
import { fetchRtmsRent, type RtmsRentRow } from "./rtms-rent";

export type RtmsSaleRow = {
  district: string;
  dong: string;
  buildingName: string;
  contractDay: string;
  priceManwon: number;
  archArea: number;
  buildingUsage: string;
  floor: number;
  archYear: string;
};

export type RtmsSalePayload = {
  district: string;
  city: string;
  rows: RtmsSaleRow[];
  avgPricePerM2: number;
  tradeCount30d: number;
  months: Array<{ yyyymm: string; avgPrice: number; count: number }>;
  sourceService: "tbLnOpendataRtmsM" | "tbLnOpendataRtmsV-proxy";
  mode: "live" | "mock";
};

function mapSaleRow(row: Record<string, unknown>): RtmsSaleRow {
  return {
    district: String(row.CGG_NM ?? ""),
    dong: String(row.STDG_NM ?? ""),
    buildingName: String(row.BLDG_NM ?? ""),
    contractDay: String(row.CTRT_DAY ?? ""),
    priceManwon: Number(row.THING_AMT ?? 0),
    archArea: Number(row.ARCH_AREA ?? 0),
    buildingUsage: String(row.BLDG_USG ?? ""),
    floor: Number(row.FLR ?? 0),
    archYear: String(row.ARCH_YR ?? ""),
  };
}

function rentRowToSaleProxy(r: RtmsRentRow): RtmsSaleRow {
  return {
    district: r.district,
    dong: r.dong,
    buildingName: r.buildingName,
    contractDay: r.contractDay,
    priceManwon: r.amountManwon,
    archArea: r.archArea,
    buildingUsage: r.buildingUsage,
    floor: r.floor,
    archYear: r.archYear,
  };
}

function buildMonthlyStats(rows: RtmsSaleRow[]): Array<{ yyyymm: string; avgPrice: number; count: number }> {
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    if (row.contractDay.length !== 8 || row.archArea <= 0) continue;
    const yyyymm = row.contractDay.slice(0, 6);
    const pricePerM2 = (row.priceManwon * 10_000) / row.archArea;
    const prev = buckets.get(yyyymm) ?? { sum: 0, count: 0 };
    buckets.set(yyyymm, { sum: prev.sum + pricePerM2, count: prev.count + 1 });
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([yyyymm, { sum, count }]) => ({
      yyyymm,
      avgPrice: Math.round(sum / count),
      count,
    }));
}

export async function fetchRtmsSale(params: {
  city?: string;
  district?: string;
}): Promise<RtmsSalePayload> {
  const district = params.district ?? "";

  try {
    const batch = await fetchAllSeoulRows("tbLnOpendataRtmsM", { maxPages: 2, pageSize: 1000 });
    const rows = batch.rows
      .map(mapSaleRow)
      .filter((r) => matchesDistrict(district, r.district));
    const recent = rows.filter((r) => {
      const day = r.contractDay;
      if (day.length !== 8) return false;
      const dt = new Date(
        Number(day.slice(0, 4)),
        Number(day.slice(4, 6)) - 1,
        Number(day.slice(6, 8)),
      );
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      return dt >= cutoff;
    });
    const withArea = recent.filter((r) => r.archArea > 0 && r.priceManwon > 0);
    const avgPricePerM2 =
      withArea.length > 0
        ? Math.round(
            withArea.reduce((s, r) => s + (r.priceManwon * 10_000) / r.archArea, 0) /
              withArea.length,
          )
        : 0;

    return {
      district: district || "전체",
      city: params.city ?? "서울",
      rows: rows.slice(0, 50),
      avgPricePerM2,
      tradeCount30d: recent.length,
      months: buildMonthlyStats(rows),
      sourceService: "tbLnOpendataRtmsM",
      mode: "live",
    };
  } catch (err) {
    if (!(err instanceof SeoulApiError) || (err.code !== "ERROR-500" && err.code !== "INFO-200")) {
      throw err;
    }
  }

  const rent = await fetchRtmsRent(params, 2);
  const rows = rent.rows.map(rentRowToSaleProxy);
  const withArea = rows.filter((r) => r.archArea > 0 && r.priceManwon > 0);
  const avgPricePerM2 =
    withArea.length > 0
      ? Math.round(
          withArea.reduce((s, r) => s + (r.priceManwon * 10_000) / r.archArea, 0) / withArea.length,
        )
      : 0;

  return {
    district: district || "전체",
    city: params.city ?? "서울",
    rows: rows.slice(0, 50),
    avgPricePerM2,
    tradeCount30d: rent.tradeCount30d,
    months: buildMonthlyStats(rows),
    sourceService: "tbLnOpendataRtmsV-proxy",
    mode: "live",
  };
}
