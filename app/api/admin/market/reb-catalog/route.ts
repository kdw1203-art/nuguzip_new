/**
 * GET /api/admin/market/reb-catalog
 * 관리자 전용. R-ONE 명세서의 디스커버리 엔드포인트(SttsApiTbl/SttsApiTblItm) 래퍼.
 *  - ?q=매매가격지수            → 이름 부분일치 통계표 목록
 *  - ?statblId=A_2024_00549     → 해당 통계표의 세부항목(ITM) 목록
 * stat-codes 검증·교정에 사용.
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { fetchRebTableList, fetchRebTableItems, isRebConfigured } from "@/lib/reb/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 전용" }, { status: 403 });
  }
  if (!isRebConfigured()) {
    return NextResponse.json({ ok: false, message: "REB_OPENAPI_KEY 미설정" }, { status: 200 });
  }
  const url = new URL(req.url);
  const statblId = url.searchParams.get("statblId")?.trim();
  const q = url.searchParams.get("q")?.trim();

  try {
    if (statblId) {
      const items = await fetchRebTableItems(statblId);
      return NextResponse.json({ ok: true, statblId, count: items.length, items });
    }
    const tables = await fetchRebTableList(q || undefined);
    return NextResponse.json({ ok: true, query: q ?? null, count: tables.length, tables: tables.slice(0, 300) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "조회 실패" },
      { status: 500 },
    );
  }
}
