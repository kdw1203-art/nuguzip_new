import { NextRequest } from "next/server";
import { ok } from "@/lib/api/response";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { leaveRoomByPolicy } from "@/lib/chat/service";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat/rooms/[id]/leave — 채팅방 나가기(left_at 소프트 기록).
 * 다시 입장하면 ensureRoomMembership 이 left_at 을 해제해 재참여된다.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const { id } = await params;
  try {
    const result = await leaveRoomByPolicy(actor, id);
    return ok(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
