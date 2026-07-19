/**
 * GET /api/apt/complexes/[kaptCode]
 * 공동주택 단지 기본정보 상세 조회
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { fetchAptComplexDetail } from "@/lib/national-data/apartment-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kaptCode: string }> },
) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { kaptCode } = await params;
  if (!kaptCode?.trim()) {
    return NextResponse.json({ error: "kaptCode가 필요합니다." }, { status: 400 });
  }

  const result = await fetchAptComplexDetail(kaptCode.trim());

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
  });
}
