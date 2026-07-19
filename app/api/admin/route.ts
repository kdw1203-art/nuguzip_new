import { NextResponse } from "next/server";
import { loadAdminKpi } from "@/lib/admin/stats";
import { isAdminApiRequest } from "@/lib/admin/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin — 관리자용 KPI JSON (운영 페이지 등 클라이언트 집계용)
 */
export async function GET() {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const kpi = await loadAdminKpi();
  return NextResponse.json({ kpi });
}
