/**
 * POST /api/map/focus-event — 노트→지도 단지 포커스 핸드오프 퍼널.
 * 비로그인은 200 + ok:false skip (화면 핸드오프는 그대로 동작).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(v: unknown, max = 120): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email?.trim() ?? null;
  if (!email) {
    return NextResponse.json({ ok: false, skipped: true, reason: "anonymous" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const complexId = toText(body.complexId, 160) || null;
  const noteId = toText(body.noteId, 80) || null;

  await recordFunnelEvent(req, {
    eventName: FUNNEL_EVENT.MAP_FOCUS_OPEN,
    userEmail: email,
    path: "/api/map/focus-event",
    metadata: {
      complexId,
      noteId,
    },
  });

  return NextResponse.json({ ok: true, complexId, noteId });
}
