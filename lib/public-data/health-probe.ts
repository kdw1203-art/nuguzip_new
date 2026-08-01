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
        /* 프로브는 3초 상한 — 상한 없이 매달리는 헬스체크는 자기 목적을
           뒤집는다(모니터가 "다운"으로 읽는다). */
        await fetchSeoulOpenApi(service, 1, 1, [], "json", { timeoutMs: 3_000 });
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
  const seoulKeyOk = isSeoulApiConfigured();
  const vworldKeyOk = isVworldConfigured();
  /* 서울 프로브 묶음과 vworld 프로브는 서로 무관하다 — 직렬로 기다릴 이유가
     없다. 각 프로브에 3초 상한이 있으므로 전체도 수 초 안에 끝난다. */
  const [liveServices, vworldBrokerLive] = await Promise.all([
    probeLiveServices(),
    vworldKeyOk ? isVworldRebBrokerAvailable() : Promise.resolve(false),
  ]);
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
