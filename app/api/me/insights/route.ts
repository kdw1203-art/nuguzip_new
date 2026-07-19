/**
 * GET /api/me/insights?district=gangnam
 * 내 임장노트 + 내 AI 실행 + 페르소나를 정규화한 통합 인사이트.
 * 비로그인은 빈 결과(200) — 위젯이 조용히 숨겨지도록.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { buildMyInsights } from "@/lib/me/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ authed: false, insights: null });
  }
  const url = new URL(req.url);
  const district = url.searchParams.get("district");
  const insights = await buildMyInsights(session.user.email, district);
  return NextResponse.json({ authed: true, insights });
}
