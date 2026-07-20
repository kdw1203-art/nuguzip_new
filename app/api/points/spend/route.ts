import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSpendItem } from "@/lib/points/catalog";
import { getBalance, spendPoints, type SpendResult } from "@/lib/points/ledger";
import { getServiceSupabase } from "@/lib/supabase/service";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function spendError(spend: SpendResult): NextResponse {
  const msg =
    spend.reason === "insufficient"
      ? "포인트가 부족해요."
      : "교환에 실패했어요. 잠시 후 다시 시도해 주세요.";
  return NextResponse.json({ error: msg, balance: spend.balance }, { status: 400 });
}

/**
 * POST /api/points/spend — body: { itemKey, listingId? }
 * 상점 아이템 교환. 잔액은 ledger(spendPoints) 가 최종 방어한다.
 * 속도 제한: IP+계정당 시간당 20회.
 */
export async function POST(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 남용 방지 — IP + 계정 조합으로 시간당 20회
  const rl = rateLimit(`points-spend:${getClientIp(req)}:${email}`, {
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const itemKey = typeof body.itemKey === "string" ? body.itemKey : "";
  const item = getSpendItem(itemKey);
  if (!item) {
    return NextResponse.json({ error: "존재하지 않는 상품이에요." }, { status: 400 });
  }
  const listingId = typeof body.listingId === "string" ? body.listingId : undefined;

  // 효과 적용 후 차감 실패로 인한 "무료 지급"을 막기 위한 사전 잔액 확인
  const balance = await getBalance(email);
  if (balance < item.cost) {
    return NextResponse.json({ error: "포인트가 부족해요.", balance }, { status: 400 });
  }

  // ── 매물 상단 노출: 대상 매물이 있을 때만 차감 (없으면 환불=미차감) ──
  if (item.effect === "listing_boost") {
    const sb = getServiceSupabase();
    if (!sb) {
      return NextResponse.json(
        { error: "잠시 후 다시 시도해 주세요.", balance },
        { status: 503 },
      );
    }
    let q = sb
      .from("listings")
      .select("id")
      .eq("author_email", email)
      .eq("status", "approved");
    if (listingId) q = q.eq("id", listingId);
    const { data: target } = await q
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const targetId = target?.id ? String(target.id) : null;
    if (!targetId) {
      return NextResponse.json(
        {
          error: "상단 노출할 승인된 매물이 없어요. 매물 등록·승인 후 이용해 주세요.",
          balance,
        },
        { status: 400 },
      );
    }

    // 효과를 먼저 적용하고, 성공한 경우에만 포인트를 차감한다.
    const boostUntil = new Date(
      Date.now() + (item.durationDays ?? 7) * DAY_MS,
    ).toISOString();
    const { error: upErr } = await sb
      .from("listings")
      .update({ boost_until: boostUntil })
      .eq("id", targetId);
    if (upErr) {
      logger.warn("[points:spend] boost update", upErr);
      return NextResponse.json(
        { error: "상단 노출 적용에 실패했어요. 잠시 후 다시 시도해 주세요.", balance },
        { status: 500 },
      );
    }

    const spend = await spendPoints(email, item.cost, `spend:${item.key}`, targetId);
    if (!spend.ok) return spendError(spend);
    return NextResponse.json({
      ok: true,
      balance: spend.balance,
      effect: item.effect,
      boostUntil,
      note: `내 매물을 ${item.durationDays ?? 7}일간 목록·지도 상단에 노출해요.`,
    });
  }

  // ── PRO / EXPERT 구독 이용권 교환: 차감 후 실제 등급 부여 시도 ──
  if (item.effect === "plan_pro" || item.effect === "plan_expert") {
    const spend = await spendPoints(email, item.cost, `spend:${item.key}`);
    if (!spend.ok) return spendError(spend);
    const tier = item.effect === "plan_pro" ? "pro" : "expert";
    let granted = false;
    try {
      granted = await applyPlanToUserByEmail(email, tier);
    } catch (e) {
      logger.warn("[points:spend] plan grant", e);
    }
    return NextResponse.json({
      ok: true,
      balance: spend.balance,
      effect: item.effect,
      grant: tier,
      note: granted
        ? `${tier.toUpperCase()} 구독 이용권이 적용됐어요. (${item.durationDays ?? 30}일)`
        : "구독 이용권이 적용됩니다. 반영까지 잠시 걸릴 수 있어요.",
    });
  }

  // ── AI 분석 / 단지 리포트: 소비 크레딧 기록 후 성공 ──
  const spend = await spendPoints(email, item.cost, `spend:${item.key}`);
  if (!spend.ok) return spendError(spend);
  const note =
    item.effect === "ai_analysis"
      ? "AI 임장 분석 1회가 충전됐어요. 내 노트에서 분석을 실행해 보세요."
      : "단지 리포트 PDF 이용권이 적용됐어요.";
  return NextResponse.json({
    ok: true,
    balance: spend.balance,
    effect: item.effect,
    grant: item.key,
    note,
  });
}
