import { fetchOdcloudApplyhome, isApplyhomeConfigured } from "@/lib/applyhome/odcloud-client";
import type {
  ApplyhomeCompetitionPayload,
  ApplyhomeCompetitionEndpoint,
  AptCompetitionRow,
} from "@/lib/applyhome/types";
import { APPLYHOME_PORTAL_URL, APPLYHOME_SWAGGER_URL } from "@/lib/applyhome/types";

function mapRow(row: AptCompetitionRow) {
  return {
    houseManageNo: row.HOUSE_MANAGE_NO,
    pblancNo: row.PBLANC_NO,
    houseType: row.HOUSE_TY,
    supplyCount: row.SUPLY_HSHLDCO ?? 0,
    regionLabel: row.RESIDE_SENM ?? "—",
    competitionRate: row.CMPET_RATE ?? "—",
    requestCount: row.REQ_CNT ?? "0",
    rankCode: row.SUBSCRPT_RANK_CODE,
  };
}

function mockPayload(endpoint: ApplyhomeCompetitionEndpoint): ApplyhomeCompetitionPayload {
  return {
    mode: "mock",
    endpoint,
    totalCount: 0,
    items: [],
    portalUrl: APPLYHOME_PORTAL_URL,
    swaggerUrl: APPLYHOME_SWAGGER_URL,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchAptCompetition(options?: {
  endpoint?: ApplyhomeCompetitionEndpoint;
  page?: number;
  perPage?: number;
  houseManageNo?: string;
  pblancNo?: string;
}): Promise<ApplyhomeCompetitionPayload> {
  const endpoint = options?.endpoint ?? "getAPTLttotPblancCmpet";
  if (!isApplyhomeConfigured()) return mockPayload(endpoint);

  const params: Record<string, string | number | undefined> = {
    page: options?.page ?? 1,
    perPage: options?.perPage ?? 20,
  };
  if (options?.houseManageNo) params["cond[HOUSE_MANAGE_NO::EQ]"] = options.houseManageNo;
  if (options?.pblancNo) params["cond[PBLANC_NO::EQ]"] = options.pblancNo;

  const json = await fetchOdcloudApplyhome<AptCompetitionRow>(endpoint, params);

  return {
    mode: "live",
    endpoint,
    totalCount: json.totalCount ?? 0,
    items: (json.data ?? []).map(mapRow),
    portalUrl: APPLYHOME_PORTAL_URL,
    swaggerUrl: APPLYHOME_SWAGGER_URL,
    fetchedAt: new Date().toISOString(),
  };
}

export { isApplyhomeConfigured };
