/**
 * GET  /api/subscriptions — 내 구독 상태 조회
 * POST /api/subscriptions — 구독 플랜 변경 요청(관리자·결제 확인 후 반영)
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const sb = getServiceSupabase();
  const email = session.user.email.trim().toLowerCase();

  // 현재 플랜 조회
  const plan = (session.user as { plan?: string }).plan ?? "free";

  // 결제 내역 최신 5건
  let payments: unknown[] = [];
  if (sb) {
    const { data } = await sb
      .from("payments")
      .select("id, plan, billing, amount, status, requested_at, paid_at, receipt_url")
      .eq("user_email", email)
      .order("requested_at", { ascending: false })
      .limit(5);
    payments = data ?? [];
  }

  return NextResponse.json({ plan, payments });
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

  const { error } = await sb
    .from("app_users")
    .update({ plan: newPlan })
    .eq("email", targetEmail);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, email: targetEmail, plan: newPlan });
}
