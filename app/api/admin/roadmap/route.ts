/**
 * /api/admin/roadmap
 *  GET    : ?quarter= → { objectives, keyResults, milestones }
 *  POST   : { kind: "objective" | "kr" | "milestone", ... }
 *  PATCH  : { kind: "kr" | "milestone", id, ...patch }
 *  DELETE : ?kind=&id=
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createOkrKeyResult,
  createOkrObjective,
  createRoadmapMilestone,
  deleteOkrKeyResult,
  deleteOkrObjective,
  deleteRoadmapMilestone,
  listOkrKeyResults,
  listOkrObjectives,
  listRoadmapMilestones,
  updateOkrKeyResult,
  updateRoadmapMilestone,
  type RoadmapStatus,
} from "@/lib/admin/business-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertAdmin() {
  const s = await auth();
  if (!s?.user?.email || s.user.role !== "admin") return null;
  return s;
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const url = new URL(req.url);
  const quarter = url.searchParams.get("quarter") ?? undefined;
  const objectives = await listOkrObjectives(quarter);
  const keyResults = await listOkrKeyResults(objectives.map((o) => o.id));
  const milestones = await listRoadmapMilestones(quarter);
  return NextResponse.json({ objectives, keyResults, milestones });
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind ?? "objective");

  if (kind === "objective") {
    const quarter = String(body.quarter ?? "").trim();
    const title = String(body.title ?? "").trim();
    if (!quarter || !title) return NextResponse.json({ error: "quarter/title 필수" }, { status: 400 });
    const ok = await createOkrObjective({
      quarter,
      title,
      ownerEmail: body.ownerEmail ? String(body.ownerEmail) : undefined,
      description: body.description ? String(body.description) : "",
    });
    if (!ok) return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  if (kind === "kr") {
    const objectiveId = String(body.objectiveId ?? "").trim();
    const title = String(body.title ?? "").trim();
    if (!objectiveId || !title) return NextResponse.json({ error: "objectiveId/title 필수" }, { status: 400 });
    const ok = await createOkrKeyResult({
      objectiveId,
      title,
      targetValue: Number(body.targetValue ?? 100),
      currentValue: Number(body.currentValue ?? 0),
      unit: body.unit ? String(body.unit) : "",
    });
    if (!ok) return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  if (kind === "milestone") {
    const quarter = String(body.quarter ?? "").trim();
    const title = String(body.title ?? "").trim();
    if (!quarter || !title) return NextResponse.json({ error: "quarter/title 필수" }, { status: 400 });
    const ok = await createRoadmapMilestone({
      quarter,
      title,
      status: (body.status as RoadmapStatus) ?? "planned",
      launchedAt: body.launchedAt ? String(body.launchedAt) : null,
      retroMd: body.retroMd ? String(body.retroMd) : "",
    });
    if (!ok) return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  return NextResponse.json({ error: "알 수 없는 kind" }, { status: 400 });
}

export async function PATCH(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  const kind = String(body.kind ?? "");
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  if (kind === "kr") {
    const ok = await updateOkrKeyResult(id, {
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.targetValue !== undefined ? { targetValue: Number(body.targetValue) } : {}),
      ...(body.currentValue !== undefined ? { currentValue: Number(body.currentValue) } : {}),
      ...(body.unit !== undefined ? { unit: String(body.unit) } : {}),
    });
    if (!ok) return NextResponse.json({ error: "수정 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (kind === "milestone") {
    const ok = await updateRoadmapMilestone(id, {
      ...(body.quarter !== undefined ? { quarter: String(body.quarter) } : {}),
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.status !== undefined ? { status: body.status as RoadmapStatus } : {}),
      ...(body.launchedAt !== undefined ? { launchedAt: body.launchedAt ? String(body.launchedAt) : null } : {}),
      ...(body.retroMd !== undefined ? { retroMd: String(body.retroMd) } : {}),
    });
    if (!ok) return NextResponse.json({ error: "수정 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "알 수 없는 kind" }, { status: 400 });
}

export async function DELETE(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const kind = url.searchParams.get("kind") ?? "";
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  if (kind === "objective") {
    const ok = await deleteOkrObjective(id);
    if (!ok) return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (kind === "kr") {
    const ok = await deleteOkrKeyResult(id);
    if (!ok) return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (kind === "milestone") {
    const ok = await deleteRoadmapMilestone(id);
    if (!ok) return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "알 수 없는 kind" }, { status: 400 });
}
