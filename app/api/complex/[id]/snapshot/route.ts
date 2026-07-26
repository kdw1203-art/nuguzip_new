/**
 * GET /api/complex/[id]/snapshot
 * 단지 스냅샷 — 실거래 · 파트너 매물 · 연결 전문가
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getComplexSnapshot } from "@/lib/map/complex-snapshot-service";
import { dbUnavailable } from "@/lib/api/db-unavailable";

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

  /* 스냅샷은 실거래·매물·전문가를 한 번에 싣는다. 조회가 실패했는데 200 으로
     빈 배열을 내보내면 지도 위 카드가 "거래 없음 · 매물 없음"이 된다. 그건
     이 단지에 대한 거짓 진술이다. 못 읽었으면 503 + Retry-After 로 답한다. */
  let payload: Awaited<ReturnType<typeof getComplexSnapshot>>;
  try {
    payload = await getComplexSnapshot(id.trim());
  } catch (e) {
    return dbUnavailable("complex-snapshot", e);
  }

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
