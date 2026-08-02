import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, READ_RATE_LIMIT, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import {
  blockUserByAliasPolicy,
  listBlockIdsByPolicy,
  unblockUserByAliasPolicy,
} from "@/lib/chat/service";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";
import { recordPlatformEvent } from "@/lib/platform-events";
import { detectShellFromUserAgent } from "@/lib/platform-shell";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   차단 API — 가명 ID 계약 (lib/chat/pseudonym.ts 주석 참고).

   예전 계약은 { blockedEmail } 이었다. 그 말은 곧 클라이언트가 상대의
   **원본 이메일을 이미 알고 있어야** 한다는 뜻이고, 실제로 스레드 API 가
   방 전원의 이메일을 내려보내고 있었다. 이제 스레드는 가명 ID 만 내려보내고,
   차단은 { roomId, blockedId(가명) } 로 받는다. 서버가 그 방 멤버들의 가명을
   재계산해 대상 이메일을 찾는다 — 지목 범위가 자기 방으로 제한되는 부수 효과도
   얻는다. 저장·집행은 그대로 이메일 기준이라 기존 차단은 전부 유효하다.
   ============================================================ */

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  /* 상대 이메일을 응답에 싣지 않는다 — 가명 ID 만으로 화면 대조가 성립한다. */
  const blocks = await listBlockIdsByPolicy(actor);
  return ok({ ok: true, blocks });
}

function parseTarget(body: Record<string, unknown>): {
  roomId: string;
  blockedId: string;
} | null {
  const roomId = String(body.roomId ?? "").trim();
  const blockedId = String(body.blockedId ?? "").trim().toLowerCase();
  if (!roomId || !/^[0-9a-f]{12}$/.test(blockedId)) return null;
  return { roomId, blockedId };
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const target = parseTarget(body);
  if (!target) {
    return apiError(
      "INVALID_BLOCK_TARGET",
      "roomId 와 blockedId(가명 ID)가 필요합니다.",
      400,
    );
  }
  try {
    const block = await blockUserByAliasPolicy(actor, {
      roomId: target.roomId,
      blockedId: target.blockedId,
      reason: body.reason ? String(body.reason) : null,
    });
    const platform = detectShellFromUserAgent(req.headers.get("user-agent"));
    void recordPlatformEvent({
      platform,
      eventName: "chat_block_user",
      userEmail: actor.email,
      source: "server_api",
      campaign: "chat",
      path: "/api/chat/blocks",
      metadata: { roomId: target.roomId, blockedId: target.blockedId },
    });
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.CHAT_BLOCK_USER,
      userEmail: actor.email,
      path: "/api/chat/blocks",
      metadata: { roomId: target.roomId, blockedId: target.blockedId },
    });
    /* 저장된 block 행에는 blockedEmail 이 있다 — 응답으로 되돌려주지 않는다. */
    return ok({ ok: true, block: { id: block.id, blockedId: target.blockedId } }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const target = parseTarget(body);
  if (!target) {
    return apiError(
      "INVALID_BLOCK_TARGET",
      "roomId 와 blockedId(가명 ID)가 필요합니다.",
      400,
    );
  }
  try {
    const okResult = await unblockUserByAliasPolicy(actor, target);
    return ok({ ok: okResult, blockedId: target.blockedId });
  } catch (e) {
    return toErrorResponse(e);
  }
}
