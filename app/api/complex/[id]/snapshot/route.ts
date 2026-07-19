/**
 * GET /api/complex/[id]/snapshot
 * 단지 스냅샷 — 실거래 · 파트너 매물 · 연결 전문가
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getComplexSnapshot } from "@/lib/map/complex-snapshot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "complex id is required" }, { status: 400 });
  }

  const payload = await getComplexSnapshot(id.trim());

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
