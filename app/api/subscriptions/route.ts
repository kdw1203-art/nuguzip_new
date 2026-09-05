/**
 * GET  /api/subscriptions — 내 구독 상태 조회
 * POST /api/subscriptions — 구독 플랜 변경 요청(관리자·결제 확인 후 반영)
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/log";
import { auth } from "@/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { loadBillingHistory } from "@/lib/subscriptions/billing-history";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import type { AppPlan } from "@/lib/billing/plan";
import { maskEmailPublic } from "@/lib/privacy/mask-email";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const email = session.user.email.trim().toLowerCase();

  // 현재 플랜 조회
  const plan = (session.user as { plan?: string }).plan ?? "free";

  /* 결제 내역은 `lib/subscriptions/billing-history` 단일 출처를 쓴다(E1).
     `/subscription` 화면이 같은 함수를 호출하므로, 여기서 따로 질의하면
     API와 화면이 서로 다른 컬럼·정렬을 보게 된다. `ok`를 함께 내려
     "조회 실패"와 "결제 없음"을 클라이언트가 구분할 수 있게 한다. */
  const { ok, payments } = await loadBillingHistory(email, 5);

  return NextResponse.json({ plan, payments, ok });
}

/** 플랜을 직접 변경하는 관리자용 엔드포인트. 일반 사용자는 /pricing 에서 결제 후 자동 반영. */
export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user?.email || role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    targetEmail?: string;
    plan?: string;
  };

  const targetEmail = String(body.targetEmail ?? "").trim().toLowerCase();
  const newPlan = String(body.plan ?? "").trim();
  const validPlans = ["free", "pro", "expert"];

  if (!targetEmail || !newPlan || !validPlans.includes(newPlan)) {
    return NextResponse.json(
      { error: "targetEmail 과 plan(free|pro|expert) 이 필요합니다." },
      { status: 400 },
    );
  }

  /* [965] 플랜만 바꾸고 만료(plan_expires_at)를 남겨 두면 안 된다 — 지난 단건 이용권의
     만료 시각이 그대로 있어, 다음 스윕(또는 [965]부터는 다음 세션 갱신)이 관리자
     부여를 곧장 free 로 되돌렸다. 단일 기록 함수(applyPlanToUserByEmail)는 기간
     없는 부여에 만료를 비운다(null). */
  const ok = await applyPlanToUserByEmail(targetEmail, newPlan as AppPlan);
  if (!ok) {
    logger.error("[api] 관리자 플랜 변경 실패", { targetEmail: maskEmailPublic(targetEmail), newPlan });
    return NextResponse.json({ error: "서버 오류 — 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, email: targetEmail, plan: newPlan });
}
