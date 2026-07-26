import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession, createJob } from "@/lib/inspection/session-store";
import { processInspectionJob } from "@/lib/inspection/job-runner";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/** 못 읽은 세션을 403 "forbidden"으로 답하지 않기 위한 안내. */
const SESSION_UNAVAILABLE = "지금은 임장 기록을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";
/** 실행을 시작조차 못 한 것을 "시나리오 없음"으로 답하지 않기 위한 안내. */
const JOB_UNAVAILABLE = "지금은 시나리오를 계산할 수 없습니다. 잠시 후 다시 시도해 주세요.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const profile = await fetchAppUserByEmail(session.user.email);
  if (!hasAccess(normalizePlanToGate(profile.plan), requirePlan("investment_scenario"))) {
    return NextResponse.json({ error: "PRO 이상 플랜이 필요합니다." }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId ?? "");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  /* 조회 실패를 403 으로 답하면 "당신 것이 아니다"라는 말이 된다 — 자기 세션을
     열어 놓고 시나리오를 돌린 사용자에게 가장 나쁜 오해다. */
  let row: Awaited<ReturnType<typeof getSession>>;
  try {
    row = await getSession(sessionId);
  } catch (err) {
    return dbUnavailable(`임장 세션 조회 실패 (id=${sessionId})`, err, SESSION_UNAVAILABLE);
  }
  if (!row || row.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  /* 시나리오를 못 만든 것과 "시나리오가 없다"는 다르다. 빈 배열로 답하면 화면은
     계산 결과가 없다고 그린다. */
  let result: Awaited<ReturnType<typeof processInspectionJob>>;
  try {
    const job = await createJob({
      sessionId,
      authorEmail: session.user.email,
      jobType: "scenario",
      input: {
        currentPriceManwon: body.currentPriceManwon,
        holdingYears: body.holdingYears ?? 3,
      },
    });
    result = await processInspectionJob(job);
  } catch (err) {
    return dbUnavailable(`시나리오 작업 실행 실패 (id=${sessionId})`, err, JOB_UNAVAILABLE);
  }
  return NextResponse.json({ job: result, scenarios: result.output?.scenarios ?? [] });
}
