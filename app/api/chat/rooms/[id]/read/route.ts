import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { readRoomByPolicy } from "@/lib/chat/service";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { lastReadMessageId?: string | null };
  const lastReadMessageId = body.lastReadMessageId ? String(body.lastReadMessageId) : null;

  if (lastReadMessageId && lastReadMessageId.length < 10) {
    return apiError("INVALID_MESSAGE_ID", "lastReadMessageId 형식이 올바르지 않습니다.", 400);
  }

  try {
    const result = await readRoomByPolicy(actor, id, lastReadMessageId);
    return ok(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
