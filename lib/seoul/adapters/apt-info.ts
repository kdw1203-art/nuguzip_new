import { fetchAllSeoulRows, matchesDistrict, SeoulApiError } from "../openapi-client";

export type AptInfoRow = {
  aptName: string;
  district: string;
  dong: string;
  buildYear: string;
  households: number;
  builder: string;
};

export type AptInfoPayload = {
  district: string;
  rows: AptInfoRow[];
  mode: "live" | "mock" | "unavailable";
};

export async function fetchAptInfo(params: {
  district?: string;
  aptName?: string;
}): Promise<AptInfoPayload> {
  const district = params.district ?? "";
  try {
    const batch = await fetchAllSeoulRows("tbSeoulAptInfo", { maxPages: 2, pageSize: 1000 });
    const rows: AptInfoRow[] = batch.rows
      .map((r) => ({
        aptName: String(r.APT_NM ?? r.KAPT_NAME ?? ""),
        district: String(r.GU_NM ?? r.CGG_NM ?? ""),
        dong: String(r.DONG_NM ?? r.STDG_NM ?? ""),
        buildYear: String(r.USEAPR_DAY ?? r.BUILD_YEAR ?? ""),
        households: Number(r.KAPT_HH_CNT ?? r.HOUSEHOLDS ?? 0),
        builder: String(r.KAPT_BCOMPANY ?? r.BUILDER ?? ""),
      }))
      .filter((r) => matchesDistrict(district, r.district))
      .filter((r) => !params.aptName || r.aptName.includes(params.aptName));

    return { district: district || "전체", rows: rows.slice(0, 100), mode: "live" };
  } catch (err) {
    if (err instanceof SeoulApiError && err.code === "ERROR-500") {
      return { district: district || "전체", rows: [], mode: "unavailable" };
    }
    throw err;
  }
}
