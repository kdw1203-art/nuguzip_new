/**
 * GET /api/applyhome/search
 * 청약홈 경쟁률·특별공급 통합 검색 (지역·단지명 필터)
 */
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
    const message = err instanceof Error ? err.message : "Applyhome search failed";
    return NextResponse.json({ error: message, mode: "error" }, { status: 502 });
  }
}
