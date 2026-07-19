/**
 * GET /api/apt/complexes?sigunguCd=11680&q=래미안
 * 공동주택 단지 목록 조회
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { fetchAptComplexList, searchAptComplex } from "@/lib/national-data/apartment-api";
import { resolveSigunguCd } from "@/lib/national-data/region-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { searchParams } = req.nextUrl;
  const rawSigungu = searchParams.get("sigunguCd")?.trim() ?? "";
  const district = searchParams.get("district")?.trim() ?? "";
  const keyword = searchParams.get("q")?.trim();
  const bjdongCd = searchParams.get("bjdongCd")?.trim();
  const numOfRows = Math.min(Number(searchParams.get("numOfRows") ?? "30"), 100);

  if (!rawSigungu && !district) {
    return NextResponse.json({ error: "sigunguCd 또는 district 파라미터가 필요합니다." }, { status: 400 });
  }

  const sigunguCd = rawSigungu.length === 5 ? rawSigungu : resolveSigunguCd(district || rawSigungu);

  const result = keyword
    ? await searchAptComplex({ sigunguCd, keyword, numOfRows })
    : await fetchAptComplexList({ sigunguCd, bjdongCd, numOfRows });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
  });
}
