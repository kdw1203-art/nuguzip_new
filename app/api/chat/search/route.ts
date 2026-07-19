import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";
import { searchMessagesByPolicy } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;

  const q = String(req.nextUrl.searchParams.get("q") ?? "").trim();
  const roomId = req.nextUrl.searchParams.get("roomId") ?? undefined;
  if (q.length < 2) {
    return apiError("INVALID_QUERY", "검색어는 2자 이상 입력해 주세요.", 400);
  }
  try {
    const hits = await searchMessagesByPolicy(actor, q, roomId);
    return ok({ ok: true, hits });
  } catch (e) {
    return toErrorResponse(e);
  }
}
