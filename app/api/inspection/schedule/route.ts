/**
 * GET    /api/inspection/schedule  — 내 임장 일정 목록
 * POST   /api/inspection/schedule  — 임장 일정 등록
 * PATCH  /api/inspection/schedule  — 상태 변경 (completed/cancelled)
 * DELETE /api/inspection/schedule?id=... — 일정 삭제
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateScheduleStatus,
  type ScheduleStatus,
} from "@/lib/inspection-schedules/store-db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as ScheduleStatus | null;
  const items = await listSchedules(session.user.email, status ?? undefined);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    region?: string;
    aptName?: string;
    scheduledAt?: string;
    durationMin?: number;
    memo?: string;
    checklist?: Array<{ label: string; done: boolean }>;
  };

  const title = String(body.title ?? "").trim();
  const region = String(body.region ?? "").trim();
  const scheduledAt = String(body.scheduledAt ?? "").trim();

  if (!title || !region || !scheduledAt) {
    return NextResponse.json(
      { error: "제목·지역·예정 일시는 필수입니다." },
      { status: 400 },
    );
  }

  try {
    const schedule = await createSchedule({
      authorEmail: session.user.email,
      authorLabel: session.user.name ?? undefined,
      title,
      region,
      aptName: body.aptName ? String(body.aptName).trim() : undefined,
      scheduledAt,
      durationMin: body.durationMin ? Number(body.durationMin) : undefined,
      memo: body.memo ? String(body.memo).trim() : undefined,
      checklist: Array.isArray(body.checklist) ? body.checklist : [],
    });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "일정 등록 실패" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    noteId?: string;
  };

  const id = String(body.id ?? "").trim();
  const status = String(body.status ?? "").trim() as ScheduleStatus;
  const validStatuses: ScheduleStatus[] = ["planned", "completed", "cancelled"];

  if (!id || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: "id와 status(planned|completed|cancelled)가 필요합니다." },
      { status: 400 },
    );
  }

  const result = await updateScheduleStatus(id, status, body.noteId);
  return NextResponse.json(result);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "id 파라미터가 필요합니다." }, { status: 400 });
  }

  const result = await deleteSchedule(id, session.user.email);
  return NextResponse.json(result);
}
