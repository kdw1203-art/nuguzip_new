/**
 * GET /api/inspection/nearby-facilities?district=강남구&lat=37.5&lng=127.0
 * 임장노트 체크리스트 prefill용 주변 시설 집계
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { isSeoulApiConfigured } from "@/lib/seoul/openapi-client";
import { fetchNearbyFacilitiesForInspection } from "@/lib/seoul/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const district = req.nextUrl.searchParams.get("district")?.trim() ?? "";
  const lat = Number(req.nextUrl.searchParams.get("lat")) || undefined;
  const lng = Number(req.nextUrl.searchParams.get("lng")) || undefined;

  if (!district && !lat) {
    return NextResponse.json(
      { error: "district 또는 lat/lng 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  if (!isSeoulApiConfigured()) {
    return NextResponse.json({
      mode: "mock",
      checks: [],
      summary: "SEOUL_DATA_API_KEY 미설정 — 목업 모드",
      counts: null,
    });
  }

  try {
    const result = await fetchNearbyFacilitiesForInspection({ district, lat, lng });
    return NextResponse.json({ mode: "live", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: message, mode: "error" }, { status: 502 });
  }
}
