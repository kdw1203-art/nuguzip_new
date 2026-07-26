import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession, createShareLink, updateSession } from "@/lib/inspection/session-store";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { canUseFeatureTrial, consumeFeatureTrial } from "@/lib/subscriptions/feature-trial";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/** 조회가 실패한 것을 "체험을 아직 안 썼다"로 읽지 않기 위한 안내. */
const TRIAL_UNAVAILABLE = "지금은 이용 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";
/** 못 읽은 세션·발급 못 한 토큰을 "됐다"로 답하지 않기 위한 안내. */
const SHARE_UNAVAILABLE = "지금은 공유 링크를 만들 수 없습니다. 잠시 후 다시 시도해 주세요.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/inspection/reports/[id]/share — 공유 링크 생성 (id=sessionId) */
export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const profile = await fetchAppUserByEmail(session.user.email);
  const plan = normalizePlanToGate(profile.plan);

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "team" ? "team" : "standard";

  const feature = mode === "team" ? requirePlan("filter_preset_share") : requirePlan("compare_report");
  if (!hasAccess(plan, feature)) {
    if (mode === "team") {
      return NextResponse.json({ error: "EXPERT 플랜에서 팀 공유를 사용할 수 있습니다." }, { status: 402 });
    }
    /* 체험 기록 조회 실패를 "아직 안 씀"으로 읽지 않는다 — compare 쪽과 같다. */
    let trialOk: boolean;
    try {
      trialOk = await canUseFeatureTrial(session.user.email, "share");
    } catch (err) {
      return dbUnavailable("체험 사용 기록 조회 실패 (share)", err, TRIAL_UNAVAILABLE);
    }
    if (!trialOk) {
      return NextResponse.json({ error: "PRO 이상 플랜이 필요합니다." }, { status: 402 });
    }
    await consumeFeatureTrial(session.user.email, "share");
  }

  const { id } = await ctx.params;
  let row: Awaited<ReturnType<typeof getSession>>;
  try {
    row = await getSession(id);
  } catch (err) {
    return dbUnavailable(`임장 세션 조회 실패 (id=${id})`, err, SHARE_UNAVAILABLE);
  }
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  /* 토큰 발급이 저장되지 않았는데 링크를 돌려주면, 사용자는 아무 데도 닿지 않는
     주소를 남에게 보낸다. 실패했으면 링크를 주지 않는다. */
  let token: string;
  let expiresAt: string | null;
  let linkMode: "standard" | "team";
  try {
    const link = await createShareLink({
      sessionId: id,
      authorEmail: session.user.email,
      mode,
    });
    token = link.token;
    expiresAt = link.expiresAt;
    linkMode = link.mode;
    if (mode === "team") {
      await updateSession(id, { privacyClass: "team" });
    }
  } catch (err) {
    return dbUnavailable(`공유 링크 발급 실패 (session=${id})`, err, SHARE_UNAVAILABLE);
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return NextResponse.json({
    token,
    expiresAt,
    mode: linkMode,
    shareUrl: `${base}/inspection/share/${token}`,
    teamHint:
      mode === "team"
        ? "팀·가족과 90일간 공유 (최대 20회 조회). PDF는 브랜딩 옵션과 함께 사용하세요."
        : undefined,
  });
}
