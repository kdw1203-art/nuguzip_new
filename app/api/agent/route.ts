/**
 * POST /api/agent — 누구집 AI 에이전트 (임장노트 + 실거래 grounding).
 *
 * - 로그인 필수: 도구가 본인 임장노트를 읽으므로 익명 접근을 막는다.
 * - 사용량: 시간당 12회/IP (LLM 비용 보호 — 요금이 아니라 운영 한도).
 * - 응답에 도구 사용 내역(trace)을 그대로 담아 화면에서 근거를 보여준다.
 */
import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { runNuguzipAgent, type AgentMessage } from "@/lib/agent/loop";
import { applyRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGES = 16;
const MAX_CONTENT = 4_000;

const DISCLAIMER =
  "본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다";

function parseMessages(raw: unknown): AgentMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: AgentMessage[] = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: string }).role;
    const content = String((m as { content?: unknown }).content ?? "")
      .slice(0, MAX_CONTENT)
      .trim();
    if (!content || (role !== "user" && role !== "assistant")) continue;
    out.push({ role, content });
  }
  return out.length > 0 && out[out.length - 1].role === "user" ? out : null;
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, { max: 12, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "로그인이 필요합니다. 에이전트는 내 임장노트를 읽어 답하기 때문이에요." },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: unknown };
  const messages = parseMessages(body.messages);
  if (!messages) {
    return NextResponse.json(
      { error: "messages 배열(마지막은 user 역할)이 필요합니다." },
      { status: 400 },
    );
  }

  const result = await runNuguzipAgent(messages, email);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.configured
          ? `에이전트 실행에 실패했어요: ${result.error}`
          : "AI 키가 아직 설정되지 않아 에이전트를 쓸 수 없어요. 관리자에게 문의해 주세요.",
        configured: result.configured,
      },
      { status: result.configured ? 502 : 503 },
    );
  }

  return NextResponse.json({
    reply: result.reply,
    trace: result.trace,
    vendor: result.vendor,
    disclaimer: DISCLAIMER,
  });
}
