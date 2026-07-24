import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getSeenTours, markTourSeen, isTourId } from "@/lib/onboarding/tours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A1 코치마크 투어 상태.
 * 비로그인은 401 대신 빈 목록 — 클라이언트가 localStorage 로 폴백한다.
 * (투어는 민감정보가 아니고, 로그인 강요 없이 한 번만 보여주는 게 목적)
 */
export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ seen: [], stored: false });
  const seen = await getSeenTours(email);
  return NextResponse.json({ seen, stored: true });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { tour?: unknown };
  const tour = typeof body.tour === "string" ? body.tour : "";
  if (!isTourId(tour)) {
    return NextResponse.json({ error: "알 수 없는 투어입니다." }, { status: 400 });
  }
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ seen: [tour], stored: false });
  const seen = await markTourSeen(email, tour);
  return NextResponse.json({ seen, stored: true });
}
