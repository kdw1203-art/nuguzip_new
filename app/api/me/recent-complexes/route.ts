/**
 * 최근 본 단지 — B8 서버 동기화.
 * GET  /api/me/recent-complexes → { items } (비로그인 → [])
 * POST /api/me/recent-complexes  body { id, name, region? } → 방문 기록(로그인 시)
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  recordRecentComplex,
  listRecentComplexes,
  removeRecentComplex,
} from "@/lib/recent-complexes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ items: [] });
  const items = await listRecentComplexes(email);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await safeAuth();
  const email = session?.user?.email;
  // 비로그인은 조용히 무시(로컬 저장만) — 200 no-op
  if (!email) return NextResponse.json({ ok: true, skipped: true });

  let id = "";
  let name = "";
  let region: string | undefined;
  try {
    const body = (await req.json()) as { id?: unknown; name?: unknown; region?: unknown };
    id = typeof body.id === "string" ? body.id : "";
    name = typeof body.name === "string" ? body.name : "";
    region = typeof body.region === "string" ? body.region : undefined;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!id || !name) return NextResponse.json({ ok: true, skipped: true });

  await recordRecentComplex(email, { id, name, region });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ ok: true, skipped: true });
  let id = "";
  try {
    const body = (await req.json()) as { id?: unknown };
    id = typeof body.id === "string" ? body.id : "";
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (id) await removeRecentComplex(email, id);
  return NextResponse.json({ ok: true });
}
