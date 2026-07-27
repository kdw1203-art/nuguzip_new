/**
 * 정비사업 구역 인근 매물·실거래 API.
 * GET /api/redevelopment/nearby?id=<projectId>
 * 반환: { project, transactions, listings, regionLabel }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProject } from "@/lib/redevelopment/store";
import { getNearbyForProject } from "@/lib/redevelopment/nearby";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  }
  /* 조회 실패(503)와 그런 구역이 없음(404)을 절대 섞지 않는다 — 실패를 404로
     답하면 "그 구역은 없는 구역"이라고 사실을 지어내는 셈이다. */
  let project: Awaited<ReturnType<typeof getProject>>;
  try {
    project = await getProject(id);
  } catch (err) {
    return dbUnavailable("api/redevelopment/nearby", err, "정비사업 구역을 불러오지 못했습니다.");
  }
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
