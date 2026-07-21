import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getReferralStats } from "@/lib/referral/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 초대 링크 기본 도메인. 요청 헤더에서 유추, 없으면 운영 도메인. */
const FALLBACK_ORIGIN = "https://nuguzip.com";

function originFrom(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return host ? `${proto}://${host}` : FALLBACK_ORIGIN;
}

/**
 * GET /api/referral — 로그인 사용자의 추천 코드·초대 링크·통계.
 * → { code, link, invitedCount, pointsEarned }, 비로그인 401.
 */
export async function GET(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const stats = await getReferralStats(email);
  const origin = originFrom(req);
  const link = stats.code ? `${origin}/invite/${stats.code}` : null;

  return NextResponse.json({
    code: stats.code,
    link,
    invitedCount: stats.invitedCount,
    pointsEarned: stats.pointsEarned,
  });
}
