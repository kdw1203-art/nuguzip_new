import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { redeemReferral } from "@/lib/referral/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/referral/redeem — body { code }.
 * 현재 로그인 사용자를 피추천인으로 리딤한다.
 * 자기추천/중복 등 방어는 store.redeemReferral 이 담당한다.
 *
 * → { ok, reason? } — 단, 2xx 는 **결론이 난 경우에만** 준다.
 *   클라이언트(components/ReferralRedeem)는 2xx 를 "이 초대는 끝났다"로 읽고
 *   ref_code 쿠키를 지운다. 그래서 DB 가 잠깐 안 될 때까지 2xx 로 답하면,
 *   조회 실패 한 번에 초대가 영구히 사라진다 — 초대한 쪽도 받은 쪽도 300P 를
 *   못 받고, 다시 시도할 방법도 없다. 일시적 실패는 503 으로 돌려 쿠키를
 *   남기고, 다음 마운트에서 재시도되게 한다.
 * → 비로그인 401 (아직 리딤 불가 → 쿠키 유지)
 */

/** 다시 시도하면 결과가 달라질 수 있는 사유 — 쿠키를 지우면 안 된다. */
const RETRYABLE_REASONS = new Set(["unavailable", "db", "error"]);
export async function POST(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json(
      { ok: false, reason: "unauthenticated" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  if (!code) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const result = await redeemReferral(code, email);
  if (!result.ok && result.reason && RETRYABLE_REASONS.has(result.reason)) {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
  return NextResponse.json({ ok: result.ok, reason: result.reason });
}
