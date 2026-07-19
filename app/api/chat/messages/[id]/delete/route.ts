import { NextRequest } from "next/server";
import { ok } from "@/lib/api/response";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { deleteMessageByPolicy } from "@/lib/chat/service";
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
  try {
    const result = await deleteMessageByPolicy(actor, id);
    return ok(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
