/**
 * POST /api/ai/feedback — AI 출력 품질(도움됨/부족함).
 * platform_activity_events 에만 기록. AI 실행 KPI와 이벤트명을 분리한다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(v: unknown, max = 80): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email?.trim() ?? null;
  if (!email) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청 본문입니다." },
      { status: 400 },
    );
  }

  const rating = body.rating === "up" || body.rating === "down" ? body.rating : null;
  if (!rating) {
    return NextResponse.json(
      { ok: false, message: "rating 은 up 또는 down 이어야 합니다." },
      { status: 400 },
    );
  }

  const targetType = toText(body.targetType, 64) || "unknown";
  const targetId = toText(body.targetId, 80) || null;
  const context =
    body.context && typeof body.context === "object" && !Array.isArray(body.context)
      ? (body.context as Record<string, unknown>)
      : {};

  await recordFunnelEvent(req, {
    eventName: FUNNEL_EVENT.AI_FEEDBACK,
    userEmail: email,
    path: "/api/ai/feedback",
    metadata: {
      rating,
      targetType,
      targetId,
      ...context,
      kpiSeparate: true,
    },
  });

  return NextResponse.json({ ok: true, rating });
}
