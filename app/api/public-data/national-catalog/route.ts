/**
 * GET /api/public-data/national-catalog
 * 활용신청 TOP CSV 기반 전국 30종 활용 로드맵 (인기 점수 포함)
 */
import { NextResponse } from "next/server";
import {
  getNationalUtilizationCatalog,
  resolveNationalIntegrationStatus,
} from "@/lib/public-data/national-utilization-catalog";
import { listPopularityRankingMeta } from "@/lib/public-data/popularity-rankings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = getNationalUtilizationCatalog().map((plan) => ({
    ...plan,
    integrationStatus: resolveNationalIntegrationStatus(plan),
    envConfigured: plan.envKey === "NONE" ? true : Boolean(process.env[plan.envKey]?.trim()),
  }));

  const byPhase = {
    phase1: catalog.filter((p) => p.phase === 1).length,
    phase2: catalog.filter((p) => p.phase === 2).length,
    phase3: catalog.filter((p) => p.phase === 3).length,
  };

  const live = catalog.filter((p) => p.integrationStatus === "live").length;
  const partial = catalog.filter((p) => p.integrationStatus === "partial").length;

  return NextResponse.json({
    catalog,
    summary: {
      total: catalog.length,
      ...byPhase,
      live,
      partial,
      rankingSources: listPopularityRankingMeta().length,
    },
    generatedAt: new Date().toISOString(),
  });
}
