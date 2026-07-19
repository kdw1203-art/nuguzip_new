import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession, createShareLink, updateSession } from "@/lib/inspection/session-store";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { canUseFeatureTrial, consumeFeatureTrial } from "@/lib/subscriptions/feature-trial";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";

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
    const trialOk = await canUseFeatureTrial(session.user.email, "share");
    if (!trialOk) {
      return NextResponse.json({ error: "PRO 이상 플랜이 필요합니다." }, { status: 402 });
    }
    await consumeFeatureTrial(session.user.email, "share");
  }

  const { id } = await ctx.params;
  const row = await getSession(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { token, expiresAt, mode: linkMode } = await createShareLink({
    sessionId: id,
    authorEmail: session.user.email,
    mode,
  });

  if (mode === "team") {
    await updateSession(id, { privacyClass: "team" });
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
