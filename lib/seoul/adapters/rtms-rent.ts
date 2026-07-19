import { fetchAllSeoulRows, matchesDistrict } from "../openapi-client";

export type RtmsRentRow = {
  district: string;
  dong: string;
  buildingName: string;
  contractDay: string;
  amountManwon: number;
  archArea: number;
  buildingUsage: string;
  floor: number;
  archYear: string;
  declareType: string;
};

export type RtmsRentPayload = {
  district: string;
  city: string;
  rows: RtmsRentRow[];
  avgDepositManwon: number;
  tradeCount30d: number;
  mode: "live" | "mock";
};

function mapRow(row: Record<string, unknown>): RtmsRentRow {
  return {
    district: String(row.CGG_NM ?? ""),
    dong: String(row.STDG_NM ?? ""),
    buildingName: String(row.BLDG_NM ?? ""),
    contractDay: String(row.CTRT_DAY ?? ""),
    amountManwon: Number(row.THING_AMT ?? 0),
    archArea: Number(row.ARCH_AREA ?? 0),
    buildingUsage: String(row.BLDG_USG ?? ""),
    floor: Number(row.FLR ?? 0),
    archYear: String(row.ARCH_YR ?? ""),
    declareType: String(row.DCLR_SE ?? ""),
  };
}

function isWithinDays(yyyymmdd: string, days: number): boolean {
  if (yyyymmdd.length !== 8) return false;
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(y, m, d);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return dt >= cutoff;
}

export async function fetchRtmsRent(
  params: { city?: string; district?: string },
  maxPages = 2,
): Promise<RtmsRentPayload> {
  const district = params.district ?? "";
  const batch = await fetchAllSeoulRows("tbLnOpendataRtmsV", { maxPages, pageSize: 1000 });
  const rows = batch.rows
    .map(mapRow)
    .filter((r) => matchesDistrict(district, r.district));

  const recent = rows.filter((r) => isWithinDays(r.contractDay, 30));
  const amounts = recent.map((r) => r.amountManwon).filter((v) => v > 0);
  const avgDepositManwon =
    amounts.length > 0
      ? Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length)
      : 0;

  return {
    district: district || "전체",
    city: params.city ?? "서울",
    rows: rows.slice(0, 50),
    avgDepositManwon,
    tradeCount30d: recent.length,
    mode: "live",
  };
}
