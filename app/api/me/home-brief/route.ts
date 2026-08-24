/* [OPT-47] 개인화 홈 브리핑 — 내 워치리스트 단지의 최근 7일 실거래 요약.
   홈은 정적(ISR 300)을 유지하고, 이 API 를 클라이언트 섬이 불러 로그인 사용자에게만
   그린다 — 개인화 때문에 홈 전체를 동적으로 되돌리지 않는다.
   데이터 소스는 주간 다이제스트와 같은 lib/market/watchlist-brief (한 근거 두 화면). */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildWatchlistBrief } from "@/lib/market/watchlist-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth().catch(() => null);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: "LOGIN_REQUIRED" }, { status: 401 });
  }
  const brief = await buildWatchlistBrief(email);
  return NextResponse.json(
    { ok: true, brief },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
