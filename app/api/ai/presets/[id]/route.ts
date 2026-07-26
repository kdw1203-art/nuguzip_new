import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deletePreset, getPreset, updatePreset } from "@/lib/ai/presets-store";

import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  /* "없습니다" 는 없다는 뜻이다 — 못 읽은 것에 쓰면 프리셋이 지워진 줄 안다. */
  let preset: Awaited<ReturnType<typeof getPreset>>;
  try {
    preset = await getPreset(id, email);
  } catch (e) {
    return dbUnavailable("ai-preset", e);
  }
  if (!preset) return NextResponse.json({ error: "없습니다." }, { status: 404 });
  return NextResponse.json({ preset });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const patch: Parameters<typeof updatePreset>[2] = {};
  if (typeof body.title === "string") patch.title = body.title.slice(0, 200);
  if (body.objective && typeof body.objective === "object" && !Array.isArray(body.objective)) {
    patch.objective = body.objective as Record<string, unknown>;
  }
  if (typeof body.subjectiveMemo === "string") patch.subjectiveMemo = body.subjectiveMemo.slice(0, 16_000);
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
  const preset = await updatePreset(id, email, patch);
  if (!preset) return NextResponse.json({ error: "없습니다." }, { status: 404 });
  return NextResponse.json({ preset });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deletePreset(id, email);
  if (!ok) return NextResponse.json({ error: "없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
