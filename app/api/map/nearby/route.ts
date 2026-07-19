/**
 * GET /api/map/nearby?lat=37.5&lng=127.0&radius=1500&providerType=broker
 * Haversine 기반 주변 전문가(공인중개사·법률 등) 검색
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { findNearbyProviders } from "@/lib/map/nearby-providers-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const radius = Number(url.searchParams.get("radius") ?? 1500);
  const providerType = url.searchParams.get("providerType")?.trim() || undefined;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng is required" }, { status: 400 });
  }

  const items = await findNearbyProviders({
    lat,
    lng,
    radiusM: Number.isFinite(radius) ? radius : 1500,
    providerType,
  });

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60" } },
  );
}
