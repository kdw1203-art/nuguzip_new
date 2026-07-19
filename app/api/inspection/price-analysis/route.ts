import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzePrice } from "@/lib/inspection/price-analysis";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/inspection/price-analysis?district=&aptName=&complexId= */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const profile = await fetchAppUserByEmail(session.user.email);
  const plan = normalizePlanToGate(profile.plan);
  const feature = requirePlan("price_analysis");
  if (!hasAccess(plan, feature)) {
    return NextResponse.json({ error: "PRO 이상 플랜이 필요합니다." }, { status: 402 });
  }

  const url = new URL(req.url);
  const district = url.searchParams.get("district") ?? undefined;
  const aptName = url.searchParams.get("aptName") ?? undefined;
  const complexId = url.searchParams.get("complexId") ?? undefined;

  const analysis = await analyzePrice({ district, aptName, complexId });
  return NextResponse.json({ analysis });
}
