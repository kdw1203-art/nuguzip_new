import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession } from "@/lib/inspection/session-store";
import { computeInvestmentScore, featuresFromReport } from "@/lib/inspection/gbdt-score";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/** 못 읽은 세션을 403 "forbidden"으로 답하지 않기 위한 안내. */
const SESSION_UNAVAILABLE = "지금은 임장 기록을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

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
    /* 조회 실패를 403 으로도, 아래 기본값 경로로도 흘려보내지 않는다. 기본값으로
       계산한 점수는 이 임장 기록의 점수가 아닌데 화면에는 그렇게 보인다. */
    let row: Awaited<ReturnType<typeof getSession>>;
    try {
      row = await getSession(sessionId);
    } catch (err) {
      return dbUnavailable(`임장 세션 조회 실패 (id=${sessionId})`, err, SESSION_UNAVAILABLE);
    }
    if (!row || row.authorEmail !== session.user.email) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (row.structuredReport) {
      const features = featuresFromReport(row.structuredReport);
      features.holdingYears = Number(body.holdingYears ?? 3);
      return NextResponse.json({ score: computeInvestmentScore(features) });
    }
  }

  /* 세션 리포트가 없을 때 body 축이 비면 60으로 채우지 않는다 — 가짜 투자점수 금지 */
  const required = ["transport", "school", "livability", "condition", "future_value"] as const;
  const missing = required.filter((k) => {
    const n = Number(body[k]);
    return !Number.isFinite(n);
  });
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "점수 축이 부족합니다. 임장 세션 리포트 또는 transport·school·livability·condition·future_value 가 필요합니다.",
        code: "INSUFFICIENT_SCORE_INPUT",
        missing: [...missing],
      },
      { status: 400 },
    );
  }
  const features = {
    transport: Number(body.transport),
    school: Number(body.school),
    livability: Number(body.livability),
    condition: Number(body.condition),
    future_value: Number(body.future_value),
    observationCount: Number(body.observationCount ?? 0),
    negativeRatio: Number(body.negativeRatio ?? 0),
    holdingYears: Number(body.holdingYears ?? 3),
  };
  return NextResponse.json({ score: computeInvestmentScore(features) });
}
