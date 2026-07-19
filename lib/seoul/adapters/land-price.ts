import { fetchAllSeoulRows, matchesDistrict, SeoulApiError } from "../openapi-client";

export type LandPriceRow = {
  district: string;
  dong: string;
  jibun: string;
  pricePerM2: number;
  year: string;
};

export type LandPricePayload = {
  district: string;
  rows: LandPriceRow[];
  avgPricePerM2: number;
  mode: "live" | "mock" | "unavailable";
};

export async function fetchLandPrice(params: { district?: string }): Promise<LandPricePayload> {
  const district = params.district ?? "";
  try {
    const batch = await fetchAllSeoulRows("landPriceInfo", { maxPages: 2, pageSize: 1000 });
    const rows: LandPriceRow[] = batch.rows
      .map((r) => ({
        district: String(r.CGG_NM ?? r.GU_NM ?? ""),
        dong: String(r.STDG_NM ?? r.DONG_NM ?? ""),
        jibun: String(r.JIBUN ?? r.LAND_ADDR ?? ""),
        pricePerM2: Number(r.PANN_JIGA ?? r.LAND_PRICE ?? 0),
        year: String(r.PANN_YR ?? r.STD_YR ?? ""),
      }))
      .filter((r) => matchesDistrict(district, r.district));

    const prices = rows.map((r) => r.pricePerM2).filter((v) => v > 0);
    const avgPricePerM2 =
      prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

    return {
      district: district || "전체",
      rows: rows.slice(0, 100),
      avgPricePerM2,
      mode: "live",
    };
  } catch (err) {
    if (err instanceof SeoulApiError && err.code === "ERROR-500") {
      return { district: district || "전체", rows: [], avgPricePerM2: 0, mode: "unavailable" };
    }
    throw err;
  }
}
