import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { loadMeProfile } from "@/lib/me/profile";
import { getUsageSummary, resolveQuotaPlan } from "@/lib/subscriptions/usage-summary";

export const runtime = "nodejs";

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

  const effectivePlan = await resolveQuotaPlan(email, profile.plan);
  const summary = await getUsageSummary(email, effectivePlan);
  return NextResponse.json(summary);
}
