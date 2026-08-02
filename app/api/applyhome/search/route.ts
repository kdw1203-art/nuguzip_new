/**
 * GET /api/applyhome/search
 * 청약홈 경쟁률·특별공급 통합 검색 (지역·단지명 필터)
 */
import { logger } from "@/lib/log";
import { NextResponse } from "next/server";
import { searchApplyhome } from "@/lib/applyhome/applyhome-search";
import type { ApplyhomeSearchTab } from "@/lib/applyhome/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABS: ApplyhomeSearchTab[] = ["competition", "special"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tabParam = searchParams.get("tab") ?? "competition";
  const tab = TABS.includes(tabParam as ApplyhomeSearchTab)
    ? (tabParam as ApplyhomeSearchTab)
    : "competition";

  try {
    const data = await searchApplyhome({
      tab,
      region: searchParams.get("region") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      page: Number(searchParams.get("page") ?? "1") || 1,
      perPage: Math.min(Number(searchParams.get("perPage") ?? "15") || 15, 30),
    });
    return NextResponse.json(data);
  } catch (err) {
    /* 업스트림(청약홈) 원문 에러는 서버 로그로만 — 익명 응답에는 일반 문구. */
    logger.warn("[api/applyhome/search] 조회 실패", err);
    return NextResponse.json(
      { error: "청약 정보 조회가 잠시 실패했습니다. 잠시 후 다시 시도해 주세요.", mode: "error" },
      { status: 502 },
    );
  }
}
