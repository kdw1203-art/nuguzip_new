/**
 * POST /api/notes/compare-event — 회차 비교 화면 진입 퍼널.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const noteId =
    typeof body.noteId === "string" ? body.noteId.trim().slice(0, 80) : null;
  const aptName =
    typeof body.aptName === "string" ? body.aptName.trim().slice(0, 120) : null;

  await recordFunnelEvent(req, {
    eventName: FUNNEL_EVENT.FIELD_COMPARE_ADD,
    userEmail: email,
    path: "/api/notes/compare-event",
    metadata: { noteId, aptName },
  });

  return NextResponse.json({ ok: true, noteId, aptName });
}
