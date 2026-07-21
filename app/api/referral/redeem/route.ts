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
 * → { ok, reason? } (성공/실패 모두 2xx — 클라이언트가 쿠키 정리 신호로 사용)
 * → 비로그인 401 (아직 리딤 불가 → 쿠키 유지)
 */
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
  return NextResponse.json({ ok: result.ok, reason: result.reason });
}
