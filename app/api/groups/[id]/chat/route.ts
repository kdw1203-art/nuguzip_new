import { NextRequest } from "next/server";
import { ok } from "@/lib/api/response";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { getOrCreateGroupRoomByPolicy } from "@/lib/chat/service";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/groups/[id]/chat
 * 모임의 그룹 채팅방을 찾거나 생성하고(idempotent) 현재 사용자를 멤버로 등록한 뒤 roomId 반환.
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
    const { roomId } = await getOrCreateGroupRoomByPolicy(actor, id);
    return ok({ ok: true, roomId });
  } catch (e) {
    return toErrorResponse(e);
  }
}
