/**
 * GET /api/public-data/status
 * 소스별 live/mock/partial 상태 (admin·UI 배지용)
 * ?source=mot-transactions → { live, label }
 */
import { NextResponse } from "next/server";
import {
  SEOUL_DATASET_CATALOG,
  getDatasetStatus,
  type SeoulDatasetStatus,
} from "@/lib/public-data-sources";
import { isPublicDataLive } from "@/lib/public-data";
import type { DataSourceId } from "@/lib/public-data/types";
import { getPublicDataProbeSummaryCached } from "@/lib/public-data/cached-probe";
import {
  getNationalUtilizationCatalog,
  resolveNationalIntegrationStatus,
} from "@/lib/public-data/national-utilization-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<DataSourceId, string> = {
  "mot-transactions": "국토부·서울 실거래가",
  "kosis-population": "통계청 인구통계",
  facilities: "서울 생활편의시설",
  schools: "학교알리미",
  redevelopment: "정비사업(upisRebuild)",
  "ex-congestion": "한국도로공사 혼잡빈도",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceParam = searchParams.get("source")?.trim();

  if (sourceParam) {
    const id = sourceParam as DataSourceId;
    if (!(id in SOURCE_LABELS)) {
      return NextResponse.json({ error: "unknown source", source: sourceParam }, { status: 404 });
    }
    return NextResponse.json({
      live: isPublicDataLive(id),
      label: SOURCE_LABELS[id],
    });
  }

  const probe = await getPublicDataProbeSummaryCached();
  const liveServices = new Set(probe.liveServices);
  const seoulKeyOk = probe.seoulApiKeyConfigured;

  const catalog = SEOUL_DATASET_CATALOG.map((meta) => ({
    ...meta,
    status: getDatasetStatus(meta, liveServices) as SeoulDatasetStatus,
    envConfigured: Boolean(process.env[meta.envKey]?.trim()),
  }));

  const sources = probe.sources.map((s) => ({
    id: s.id,
    live: s.live,
    mode: s.live ? "live" : "mock",
  }));

  const nationalCatalog = getNationalUtilizationCatalog().map((plan) => ({
    id: plan.id,
    title: plan.title,
    phase: plan.phase,
    kind: plan.kind,
    integrationStatus: resolveNationalIntegrationStatus(plan),
    popularityScore: plan.popularityScore,
    envConfigured: plan.envKey === "NONE" ? true : Boolean(process.env[plan.envKey]?.trim()),
  }));

  return NextResponse.json({
    seoulApiKeyConfigured: seoulKeyOk,
    liveServiceCount: probe.liveServiceCount,
    liveServices: probe.liveServices,
    sources,
    catalog,
    nationalCatalog,
    nationalCatalogSummary: probe.nationalCatalog,
    probedAt: probe.probedAt,
  });
}
