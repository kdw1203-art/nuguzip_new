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
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";

/** 못 읽은 목록을 "등록한 단지가 없어요"로 그리지 않기 위한 안내. */
const WATCHLIST_UNAVAILABLE = "지금은 관심 단지를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

export async function GET(req: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const complexId = req.nextUrl.searchParams.get("complexId");
  if (complexId) {
    try {
      const watching = await isWatching(session.user.email, complexId);
      return NextResponse.json({ watching });
    } catch (err) {
      return dbUnavailable(`관심 등록 여부 조회 실패 (complex=${complexId})`, err, WATCHLIST_UNAVAILABLE);
    }
  }
  try {
    const list = await listWatchlist(session.user.email);
    return NextResponse.json({ items: list });
  } catch (err) {
    return dbUnavailable("관심 단지 목록 조회 실패", err, WATCHLIST_UNAVAILABLE);
  }
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
    /* 등록 여부·현재 개수를 못 읽은 채로 진행하면 한도 검사가 통째로 풀린다
       (개수 0 = 전부 남음). 여기서는 넣지 않고 "지금은 못 한다"고 답한다. */
    let watching: boolean;
    let quota: Awaited<ReturnType<typeof checkWatchlistAddQuota>>;
    try {
      const [w, plan] = await Promise.all([
        isWatching(email, complexId),
        resolveQuotaPlan(email, session.user.plan),
      ]);
      watching = w;
      quota = await checkWatchlistAddQuota(email, plan, watching);
    } catch (err) {
      return dbUnavailable(`관심 단지 한도 확인 실패 (complex=${complexId})`, err, WATCHLIST_UNAVAILABLE);
    }
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
