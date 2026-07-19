/**
 * GET /api/public-data/[source]?city=서울&district=강남구&yyyymm=202504
 *
 * 지원 source: mot-transactions | kosis-population | facilities | schools | redevelopment | ex-congestion
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fetchPublicData, type DataSourceId } from "@/lib/public-data";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SOURCES: DataSourceId[] = [
  "mot-transactions",
  "kosis-population",
  "facilities",
  "schools",
  "redevelopment",
  "ex-congestion",
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ source: string }> },
) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { source } = await params;

  if (!VALID_SOURCES.includes(source as DataSourceId)) {
    return NextResponse.json(
      {
        error: `잘못된 source 입니다. 허용: ${VALID_SOURCES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const { searchParams } = req.nextUrl;
  const city = searchParams.get("city")?.trim() ?? "";
  const district = searchParams.get("district")?.trim() ?? "";
  const yyyymm = searchParams.get("yyyymm")?.trim() ?? "";
  const routeNo = searchParams.get("routeNo")?.trim() ?? "";
  const zone = searchParams.get("zone")?.trim() ?? "";

  if (source !== "ex-congestion" && !city && !district) {
    return NextResponse.json(
      { error: "city 또는 district 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  const result = await fetchPublicData(
    source as DataSourceId,
    { city, district, yyyymm, routeNo, zone },
  );

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
