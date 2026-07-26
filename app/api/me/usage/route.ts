import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { loadMeProfile } from "@/lib/me/profile";
import { getUsageSummary, resolveQuotaPlan } from "@/lib/subscriptions/usage-summary";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";

/** 못 센 사용량을 "0회 사용"으로 답하지 않기 위한 안내. */
const USAGE_UNAVAILABLE = "지금은 사용량을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const profile = await loadMeProfile(email, {
    name: session.user.name ?? null,
    plan: session.user.plan ?? "free",
    role: session.user.role ?? "user",
  });

  /* 사용량 합계는 여러 카운트 조회의 합이다. 하나라도 못 세면 화면에는 실제보다
     적은 숫자가 "이번 달 사용량"으로 찍힌다 — 그 숫자를 보고 한도가 남았다고
     믿게 되므로, 못 셌을 때는 숫자 대신 못 불러왔다고 답한다. */
  try {
    const effectivePlan = await resolveQuotaPlan(email, profile.plan);
    const summary = await getUsageSummary(email, effectivePlan);
    return NextResponse.json(summary);
  } catch (err) {
    return dbUnavailable("사용량 요약 조회 실패", err, USAGE_UNAVAILABLE);
  }
}
