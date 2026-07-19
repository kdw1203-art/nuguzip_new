import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession } from "@/lib/inspection/session-store";
import { computeInvestmentScore, featuresFromReport } from "@/lib/inspection/gbdt-score";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const profile = await fetchAppUserByEmail(session.user.email);
  if (!hasAccess(normalizePlanToGate(profile.plan), requirePlan("ai_note_advanced"))) {
    return NextResponse.json({ error: "PRO 이상 플랜이 필요합니다." }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId ?? "");
  if (sessionId) {
    const row = await getSession(sessionId);
    if (!row || row.authorEmail !== session.user.email) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (row.structuredReport) {
      const features = featuresFromReport(row.structuredReport);
      features.holdingYears = Number(body.holdingYears ?? 3);
      return NextResponse.json({ score: computeInvestmentScore(features) });
    }
  }

  const features = {
    transport: Number(body.transport ?? 60),
    school: Number(body.school ?? 60),
    livability: Number(body.livability ?? 60),
    condition: Number(body.condition ?? 60),
    future_value: Number(body.future_value ?? 60),
    observationCount: Number(body.observationCount ?? 5),
    negativeRatio: Number(body.negativeRatio ?? 0.2),
    holdingYears: Number(body.holdingYears ?? 3),
  };
  return NextResponse.json({ score: computeInvestmentScore(features) });
}
