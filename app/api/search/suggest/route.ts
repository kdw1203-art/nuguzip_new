import { NextResponse } from "next/server";
import { searchComplexes } from "@/lib/complex/complex-store";

/* 검색 자동완성(#48) — 단지명 프리픽스 서제스트.
   complexes(search_complexes RPC) 상위 8건 {id,name,region,dong} 반환.
   CDN 캐시 s-maxage=3600 (인기 프리픽스 재활용). */

export const runtime = "nodejs";

export interface SuggestItem {
  id: string;
  name: string;
  region: string;
  dong: string;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json(
      { suggestions: [] as SuggestItem[], query: q },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  }

  let suggestions: SuggestItem[] = [];
  try {
    const rows = await searchComplexes(q, undefined, 8);
    suggestions = rows.slice(0, 8).map((c) => ({
      id: c.id,
      name: c.name,
      region: `${c.city} ${c.district}`.trim(),
      dong: c.district || c.city || "",
    }));
  } catch {
    // env 미설정·조회 실패 시 빈 목록 (클라이언트는 드롭다운 미표시)
    suggestions = [];
  }

  return NextResponse.json(
    { suggestions, query: q },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
