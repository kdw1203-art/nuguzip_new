/**
 * GET /api/traffic/congestion-frequency?routeNo=1&yyyymm=202410&zone=양재&limit=10
 *
 * 한국도로공사 혼잡빈도 (공공데이터포털 15045664) — 샘플·수도권 구간 집계.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  fetchExCongestionFrequency,
  listExCongestionRoutes,
} from "@/lib/ex/adapters/congestion-frequency";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { searchParams } = req.nextUrl;

  if (searchParams.get("meta") === "routes") {
    return NextResponse.json({ routes: listExCongestionRoutes() });
  }

  const routeNoRaw = searchParams.get("routeNo");
  const routeNo = routeNoRaw ? Number.parseInt(routeNoRaw, 10) : undefined;
  const yyyymm = searchParams.get("yyyymm")?.trim() ?? undefined;
  const zone = searchParams.get("zone")?.trim() ?? undefined;
  const minFrequencyRaw = searchParams.get("minFrequency");
  const limitRaw = searchParams.get("limit");

  const result = await fetchExCongestionFrequency({
    routeNo: Number.isFinite(routeNo) ? routeNo : undefined,
    yyyymm,
    zoneQuery: zone,
    minFrequency: minFrequencyRaw ? Number.parseInt(minFrequencyRaw, 10) : undefined,
    limit: limitRaw ? Number.parseInt(limitRaw, 10) : undefined,
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  });
}
