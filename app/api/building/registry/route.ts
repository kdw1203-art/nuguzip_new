/**
 * GET /api/building/registry?sigunguCd=11680&bjdongCd=10300
 * 건축물대장 기본개요 조회
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { fetchBuildingBasisInfo } from "@/lib/national-data/buildhub-api";
import { resolveSigunguCd } from "@/lib/national-data/region-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { searchParams } = req.nextUrl;
  const rawSigungu = searchParams.get("sigunguCd")?.trim() ?? "";
  const district = searchParams.get("district")?.trim() ?? "";
  const bjdongCd = searchParams.get("bjdongCd")?.trim() ?? "00000";
  const numOfRows = Math.min(Number(searchParams.get("numOfRows") ?? "20"), 100);

  const sigunguCd = rawSigungu.length === 5 ? rawSigungu : resolveSigunguCd(district || rawSigungu);

  const result = await fetchBuildingBasisInfo({ sigunguCd, bjdongCd, numOfRows });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
  });
}
