/**
 * GET /api/building/permits?sigunguCd=11680&type=arch|housing
 * 건축·주택 인허가 조회
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { fetchArchPermits, fetchHousingPermits } from "@/lib/national-data/buildhub-api";
import { resolveSigunguCd } from "@/lib/national-data/region-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { searchParams } = req.nextUrl;
  const rawSigungu = searchParams.get("sigunguCd")?.trim() ?? "";
  const district = searchParams.get("district")?.trim() ?? "";
  const bjdongCd = searchParams.get("bjdongCd")?.trim();
  const type = searchParams.get("type") === "housing" ? "housing" : "arch";
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();
  const numOfRows = Math.min(Number(searchParams.get("numOfRows") ?? "20"), 100);

  const sigunguCd = rawSigungu.length === 5 ? rawSigungu : resolveSigunguCd(district || rawSigungu);

  const params = { sigunguCd, bjdongCd, startDate, endDate, numOfRows };
  const result = type === "housing"
    ? await fetchHousingPermits(params)
    : await fetchArchPermits(params);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
  });
}
