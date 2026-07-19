/**
 * GET /api/public-data/national/batch?ids=molit-apt-sale,weather-short&district=강남구
 * ids 생략 시 intent(실거주|투자|전월세)로 planIdsForIntent 사용
 */
import { NextResponse } from "next/server";
import { fetchNationalPlan, NATIONAL_PLAN_IDS } from "@/lib/national-data/fetch";
import {
  planIdsForIntent,
  type InspectionIntent,
} from "@/lib/inspection/public-data-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_INTENTS: InspectionIntent[] = ["실거주", "투자", "전월세"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids") ?? "";
  const intentParam = searchParams.get("intent") ?? "";
  const intent = VALID_INTENTS.includes(intentParam as InspectionIntent)
    ? (intentParam as InspectionIntent)
    : undefined;

  let ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((id) => NATIONAL_PLAN_IDS.includes(id))
    .slice(0, 8);

  if (ids.length === 0 && intent) {
    ids = planIdsForIntent(intent).filter((id) => NATIONAL_PLAN_IDS.includes(id)).slice(0, 8);
  }

  if (ids.length === 0) {
    return NextResponse.json(
      {
        error: "ids query required (comma-separated plan ids) or intent (실거주|투자|전월세)",
        validIds: NATIONAL_PLAN_IDS,
      },
      { status: 400 },
    );
  }

  const district = searchParams.get("district") ?? undefined;
  const q = searchParams.get("q") ?? searchParams.get("aptName") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? "5") || 5, 15);

  const results = await Promise.allSettled(
    ids.map((id) => fetchNationalPlan(id, { district, q, limit })),
  );

  const items = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { planId: ids[i], error: true, summary: "fetch failed", items: [], mode: "planned" },
  );

  return NextResponse.json({
    count: items.length,
    items,
    intent: intent ?? null,
    fetchedAt: new Date().toISOString(),
  });
}
