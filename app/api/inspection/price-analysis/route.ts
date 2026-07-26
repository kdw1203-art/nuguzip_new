import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzePrice } from "@/lib/inspection/price-analysis";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { dbUnavailable } from "@/lib/api/db-unavailable";

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

  /* 실거래 조회가 실패하면 analyzePrice 가 던진다. 그대로 두면 500 에 내부
     오류 메시지가 실려 나가고, 예전처럼 삼키면 워크벤치 샘플 시세가 "live"인 척
     내려간다 — 둘 다 사실이 아니다. 못 읽었을 뿐이라고 503 으로 말한다. */
  let analysis: Awaited<ReturnType<typeof analyzePrice>>;
  try {
    analysis = await analyzePrice({ district, aptName, complexId });
  } catch (e) {
    return dbUnavailable("inspection-price-analysis", e);
  }
  return NextResponse.json({ analysis });
}
