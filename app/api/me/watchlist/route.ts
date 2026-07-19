import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { listWatchlist, addToWatchlist, removeFromWatchlist, isWatching } from "@/lib/watchlist/store-db";
import { applyRateLimit } from "@/lib/rate-limit";
import { appendOnboardingStep } from "@/lib/onboarding/append-step";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import {
  checkWatchlistAddQuota,
  quotaDeniedJson,
  resolveQuotaPlan,
} from "@/lib/subscriptions/usage-summary";
import { withUserQuotaLock } from "@/lib/subscriptions/quota-lock";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const complexId = req.nextUrl.searchParams.get("complexId");
  if (complexId) {
    const watching = await isWatching(session.user.email, complexId);
    return NextResponse.json({ watching });
  }
  const list = await listWatchlist(session.user.email);
  return NextResponse.json({ items: list });
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req);
  if (limited) return limited;
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 }); }

  const complexId = String(body.complexId ?? "").trim();
  const complexName = String(body.complexName ?? "").trim();
  if (!complexId || !complexName) return NextResponse.json({ error: "complexId, complexName 이 필요합니다." }, { status: 400 });

  const email = session.user.email;

  return withUserQuotaLock(`watchlist:${email}`, async () => {
    const [watching, plan] = await Promise.all([
      isWatching(email, complexId),
      resolveQuotaPlan(email, session.user.plan),
    ]);
    const quota = await checkWatchlistAddQuota(email, plan, watching);
    if (!quota.allowed) {
      return NextResponse.json(quotaDeniedJson(quota.message, quota.requiredTier, quota.used, quota.limit), {
        status: 403,
      });
    }

    const item = await addToWatchlist(
      email,
      complexId,
      complexName,
      body.alertPriceMin ? Number(body.alertPriceMin) : undefined,
      body.alertPriceMax ? Number(body.alertPriceMax) : undefined,
    );
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.WATCHLIST_ADD,
      userEmail: email,
      path: "/api/me/watchlist",
      metadata: { complexId },
    });
    void appendOnboardingStep(email, "explore");
    return NextResponse.json(item, { status: 201 });
  });
}

export async function DELETE(req: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const complexId = req.nextUrl.searchParams.get("complexId");
  if (!complexId) return NextResponse.json({ error: "complexId 가 필요합니다." }, { status: 400 });
  await removeFromWatchlist(session.user.email, complexId);
  void recordFunnelEvent(req, {
    eventName: FUNNEL_EVENT.WATCHLIST_REMOVE,
    userEmail: session.user.email,
    path: "/api/me/watchlist",
    metadata: { complexId },
  });
  return NextResponse.json({ ok: true });
}
