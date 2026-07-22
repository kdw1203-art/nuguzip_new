/**
 * 정비사업 구역 인근 매물·실거래 API.
 * GET /api/redevelopment/nearby?id=<projectId>
 * 반환: { project, transactions, listings, regionLabel }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProject } from "@/lib/redevelopment/store";
import { getNearbyForProject } from "@/lib/redevelopment/nearby";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  }
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "구역을 찾을 수 없습니다." }, { status: 404 });
  }
  const nearby = await getNearbyForProject(project);
  return NextResponse.json(
    {
      project: {
        id: project.id,
        name: project.name,
        sido: project.sido,
        sigungu: project.sigungu,
      },
      ...nearby,
    },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
