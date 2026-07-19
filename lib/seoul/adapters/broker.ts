import { fetchAllSeoulRows, extractDistrictFromAddress, matchesDistrict, SeoulApiError } from "../openapi-client";
import { fetchVworldRebBrokers, isVworldConfigured } from "@/lib/vworld/adapters";

export type BrokerRow = {
  name: string;
  district: string;
  address: string;
  tel: string;
};

export type BrokerPayload = {
  district: string;
  rows: BrokerRow[];
  mode: "live" | "mock" | "unavailable";
};

export async function fetchBrokers(params: { district?: string; q?: string }): Promise<BrokerPayload> {
  const district = params.district ?? "";

  if (isVworldConfigured()) {
    const vworld = await fetchVworldRebBrokers({
      district,
      q: params.q,
      perPage: 100,
    });
    if (vworld.mode === "live" && vworld.rows.length > 0) {
      return vworld;
    }
  }

  try {
    const batch = await fetchAllSeoulRows("tbPropertyBrokerInfo", { maxPages: 2, pageSize: 1000 });
    const rows: BrokerRow[] = batch.rows
      .map((r) => ({
        name: String(r.BRKR_NM ?? r.AGENCY_NM ?? ""),
        district:
          String(r.CGG_NM ?? "") ||
          extractDistrictFromAddress(String(r.ADDR ?? r.ROAD_ADDR ?? "")) ||
          "",
        address: String(r.ADDR ?? r.ROAD_ADDR ?? ""),
        tel: String(r.TELNO ?? r.TEL ?? ""),
      }))
      .filter((r) => matchesDistrict(district, r.district));

    return { district: district || "전체", rows: rows.slice(0, 100), mode: "live" };
  } catch (err) {
    if (err instanceof SeoulApiError && err.code === "ERROR-500") {
      return { district: district || "전체", rows: [], mode: "unavailable" };
    }
    throw err;
  }
}
