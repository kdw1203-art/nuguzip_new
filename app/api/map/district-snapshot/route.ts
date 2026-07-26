/**
 * GET /api/map/district-snapshot?districtKey=서울-강남구-대치동&month=2026-06
 * Mongo 스타일 district workspace 문서 조회
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getDistrictSnapshotDocument } from "@/lib/map/district-snapshot-store";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const districtKey = url.searchParams.get("districtKey")?.trim();
  const month = url.searchParams.get("month")?.trim() || undefined;

  if (!districtKey) {
    return NextResponse.json({ error: "districtKey is required" }, { status: 400 });
  }

  /* 조회가 실패했는데 404 "snapshot not found" 로 답하면 "이 동네는 자료가 없다"는
     단정이 된다. 못 읽었을 뿐이면 503 + Retry-After 로 그렇게 말한다. */
  let result: Awaited<ReturnType<typeof getDistrictSnapshotDocument>>;
  try {
    result = await getDistrictSnapshotDocument({ districtKey, snapshotMonth: month });
  } catch (e) {
    return dbUnavailable("map-district-snapshot", e);
  }
  const { document, source } = result;

  if (!document) {
    return NextResponse.json({ error: "snapshot not found" }, { status: 404 });
  }

  return NextResponse.json({ document, source });
}
