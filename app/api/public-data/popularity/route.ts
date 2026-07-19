/**
 * GET /api/public-data/popularity?kind=file|openapi&listId=...
 * 공공데이터포털 활용신청 TOP CSV 6종 원본 목록
 */
import { NextResponse } from "next/server";
import {
  getPopularityRankings,
  getLatestRankingExportedAt,
  listPopularityRankingMeta,
  type RankingKind,
} from "@/lib/public-data/popularity-rankings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") as RankingKind | null;
  const listId = searchParams.get("listId") ?? undefined;

  const lists = listPopularityRankingMeta();
  const rankings = getPopularityRankings({
    kind: kind === "file" || kind === "openapi" ? kind : undefined,
    listId,
  });

  return NextResponse.json({
    lists,
    rankings,
    total: rankings.length,
    exportedAt: getLatestRankingExportedAt() ?? new Date().toISOString().slice(0, 10),
  });
}
