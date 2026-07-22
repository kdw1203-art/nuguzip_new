/**
 * 정비사업장 조회 API — 지도/목록 공용.
 * GET /api/redevelopment/projects?types=&stages=&sigungu=&bbox=minLat,minLng,maxLat,maxLng&limit=
 * 반환: { items: RedevelopmentProject[] }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listProjects } from "@/lib/redevelopment/store";
import { isProjectTypeKey, isStageKey } from "@/lib/redevelopment/types";
import type { ProjectFilter, ProjectTypeKey, StageKey } from "@/lib/redevelopment/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseList(v: string | null): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBbox(v: string | null): ProjectFilter["bbox"] {
  if (!v) return undefined;
  const parts = v.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [minLat, minLng, maxLat, maxLng] = parts;
  return { minLat, minLng, maxLat, maxLng };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const types = parseList(sp.get("types")).filter(isProjectTypeKey) as ProjectTypeKey[];
  const stages = parseList(sp.get("stages")).filter(isStageKey) as StageKey[];
  const sigungu = (sp.get("sigungu") ?? "").trim() || undefined;
  const bbox = parseBbox(sp.get("bbox"));
  const limitRaw = Number(sp.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 3000) : 2000;

  const filter: ProjectFilter = {
    types: types.length ? types : undefined,
    stages: stages.length ? stages : undefined,
    sigungu,
    bbox,
    limit,
  };

  const items = await listProjects(filter);
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
