import { isSeoulApiConfigured, fetchSeoulOpenApi } from "@/lib/seoul/openapi-client";
import { isPublicDataLive } from "@/lib/public-data";
import type { DataSourceId } from "@/lib/public-data/types";
import { NATIONAL_PLAN_IDS } from "@/lib/national-data/fetch";
import {
  getNationalUtilizationCatalog,
  resolveNationalIntegrationStatus,
} from "@/lib/public-data/national-utilization-catalog";
import { listPopularityRankingMeta } from "@/lib/public-data/popularity-rankings";
import { isVworldConfigured } from "@/lib/vworld/client";
import { isVworldRebBrokerAvailable } from "@/lib/vworld/adapters";
const PROBE_SERVICES = [
  "upisRebuild",
  "tbLnOpendataRtmsM",
  "tbLnOpendataRtmsV",
  "TbHospitalInfo",
  "TbPharmacyOperateInfo",
  "ChildCareInfo",
  "SearchParkInfoService",
  "SearchSTNBySubwayLineInfo",
  "GetParkInfo",
] as const;

async function probeLiveServices(): Promise<Set<string>> {
  const live = new Set<string>();
  if (!isSeoulApiConfigured()) return live;

  await Promise.all(
    PROBE_SERVICES.map(async (service) => {
      try {
        await fetchSeoulOpenApi(service, 1, 1);
        live.add(service);
      } catch {
        // not live
      }
    }),
  );

  if (live.has("tbLnOpendataRtmsM") || live.has("tbLnOpendataRtmsV")) {
    live.add("tbLnOpendataRtmsM");
    live.add("tbLnOpendataRtmsV");
  }

  return live;
}

export type PublicDataProbeSummary = {
  seoulApiKeyConfigured: boolean;
  vworldApiKeyConfigured: boolean;
  vworldRebBrokerLive: boolean;
  liveServiceCount: number;  liveServices: string[];
  sources: Array<{ id: DataSourceId; live: boolean }>;
  nationalCatalog: {
    total: number;
    live: number;
    partial: number;
    sample: number;
    fetchersRegistered: number;
    rankingCsvCount: number;
  };
  probedAt: string;
};

export async function getPublicDataProbeSummary(): Promise<PublicDataProbeSummary> {
  const liveServices = await probeLiveServices();
  const seoulKeyOk = isSeoulApiConfigured();
  const vworldKeyOk = isVworldConfigured();
  const vworldBrokerLive = vworldKeyOk ? await isVworldRebBrokerAvailable() : false;
  const publicDataSources: DataSourceId[] = [
    "mot-transactions",
    "kosis-population",
    "facilities",
    "schools",
    "redevelopment",
    "ex-congestion",
  ];

  const sources = publicDataSources.map((id) => ({
    id,
    live: isPublicDataLive(id),
  }));

  const nationalCatalog = getNationalUtilizationCatalog().map((plan) => ({
    integrationStatus: resolveNationalIntegrationStatus(plan),
  }));

  return {
    seoulApiKeyConfigured: seoulKeyOk,
    vworldApiKeyConfigured: vworldKeyOk,
    vworldRebBrokerLive: vworldBrokerLive,
    liveServiceCount: liveServices.size,    liveServices: [...liveServices],
    sources,
    nationalCatalog: {
      total: nationalCatalog.length,
      live: nationalCatalog.filter((p) => p.integrationStatus === "live").length,
      partial: nationalCatalog.filter((p) => p.integrationStatus === "partial").length,
      sample: nationalCatalog.filter((p) => p.integrationStatus === "sample").length,
      fetchersRegistered: NATIONAL_PLAN_IDS.length,
      rankingCsvCount: listPopularityRankingMeta().length,
    },
    probedAt: new Date().toISOString(),
  };
}
