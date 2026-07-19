/**
 * GET /api/public-data/national/[id]
 * 전국 30종 활용 방안 데이터 조회
 */
import { NextResponse } from "next/server";
import { fetchNationalPlan, NATIONAL_PLAN_IDS } from "@/lib/national-data/fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);

  if (id === "all") {
    try {
      const { fetchAllNationalPlans } = await import("@/lib/national-data/fetch");
      const items = await fetchAllNationalPlans({
        district: searchParams.get("district") ?? undefined,
        q: searchParams.get("q") ?? undefined,
        limit: Number(searchParams.get("limit") ?? "3") || 3,
      });
      return NextResponse.json({ count: items.length, items, fetchedAt: new Date().toISOString() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (!NATIONAL_PLAN_IDS.includes(id)) {
    return NextResponse.json(
      { error: "unknown plan id", validIds: NATIONAL_PLAN_IDS },
      { status: 404 },
    );
  }

  try {
    const data = await fetchNationalPlan(id, {
      district: searchParams.get("district") ?? undefined,
      city: searchParams.get("city") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      lat: searchParams.get("lat") ?? undefined,
      lng: searchParams.get("lng") ?? undefined,
      yyyymm: searchParams.get("yyyymm") ?? undefined,
      limit: Math.min(Number(searchParams.get("limit") ?? "10") || 10, 30),
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
