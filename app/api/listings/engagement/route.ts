/**
 * POST /api/listings/engagement  body: { ids: string[] }
 * 단지 id 목록의 실제 조회수·관심(북마크) 수를 반환. 데이터 없는 id는 생략.
 */
import { NextResponse } from "next/server";
import { getEngagementMap } from "@/lib/listings/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let ids: string[] = [];
  try {
    const body = (await req.json()) as { ids?: unknown };
    if (Array.isArray(body.ids)) ids = body.ids.filter((x): x is string => typeof x === "string");
  } catch {
    ids = [];
  }
  if (ids.length === 0) return NextResponse.json({ map: {} });
  const map = await getEngagementMap(ids);
  const out: Record<string, { viewCount: number; bookmarkCount: number }> = {};
  for (const [id, v] of map) out[id] = v;
  return NextResponse.json({ map: out });
}
