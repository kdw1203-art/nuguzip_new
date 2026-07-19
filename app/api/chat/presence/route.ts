import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";
import { updatePresenceByPolicy } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const body = (await req.json().catch(() => ({}))) as {
    roomId?: string | null;
    isOnline?: boolean;
  };
  const isOnline = Boolean(body.isOnline);
  const roomId = body.roomId == null ? null : String(body.roomId).trim() || null;
  if (roomId && roomId.length < 8) {
    return apiError("INVALID_ROOM_ID", "roomId 형식이 올바르지 않습니다.", 400);
  }
  try {
    const result = await updatePresenceByPolicy(actor, roomId, isOnline);
    return ok(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
