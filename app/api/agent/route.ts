/**
 * POST /api/agent — 누구집 AI 에이전트 (임장노트 + 실거래 grounding).
 *
 * - 로그인 필수: 도구가 본인 임장노트를 읽으므로 익명 접근을 막는다.
 *   인증을 먼저 검사해 비로그인 요청이 한도를 소진하지 않는다.
 * - 사용량: 시간당 12회/계정(`agent:{email}`) + 무료 플랜 월 10회.
 * - 레이트리밋 백엔드(Upstash) 실패 시 fail-open 하되, 로깅하고
 *   라운드 상한을 절반으로 낮춰 보수적으로 운행한다.
 * - 응답에 도구 사용 내역(trace)을 그대로 담아 화면에서 근거를 보여준다.
 */
import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { runNuguzipAgent, type AgentMessage } from "@/lib/agent/loop";
import { checkAgentQuota, recordAgentRun } from "@/lib/agent/quota";
import { keyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGES = 16;
const MAX_CONTENT = 4_000;

/** 시간당 계정별 요청 상한 */
const HOURLY_MAX = 12;
const HOURLY_WINDOW_MS = 60 * 60_000;
/** 레이트리밋 백엔드 장애(fail-open) 시 라운드 상한 — 기본 4의 절반 */
const DEGRADED_MAX_ROUNDS = 2;

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

function rateHeaders(remaining: number, resetAt: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(HOURLY_MAX),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}

export async function POST(req: NextRequest) {
  /* 1) 인증 먼저 — 비로그인 요청은 레이트리밋·쿼터를 건드리지 않고 401 */
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "로그인이 필요합니다. 에이전트는 내 임장노트를 읽어 답하기 때문이에요." },
      { status: 401 },
    );
  }

  /* 2) 계정 단위 시간당 한도 */
  const rl = await keyRateLimit(`agent:${email}`, {
    max: HOURLY_MAX,
    windowMs: HOURLY_WINDOW_MS,
  });
  if (!rl.ok) {
    const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: `시간당 ${HOURLY_MAX}회 한도를 모두 썼어요. 잠시 후 다시 시도해 주세요.`,
        retryAfterSec,
        limit: HOURLY_MAX,
        remaining: 0,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          ...rateHeaders(0, rl.resetAt),
        },
      },
    );
  }
  /* 백엔드 장애 fail-open — 차단 대신 로깅 + 라운드 상한 절반으로 보수 운행 */
  let maxRounds: number | undefined;
  if (rl.degraded) {
    logger.warn(
      "[api/agent] 레이트리밋 백엔드 실패 — fail-open, 라운드 상한 완화 적용",
      { maxRounds: DEGRADED_MAX_ROUNDS },
    );
    maxRounds = DEGRADED_MAX_ROUNDS;
  }

  /* 3) 플랜 게이트 — 무료 플랜 월 10회 */
  const quota = await checkAgentQuota(email);
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: `이번 달 에이전트 사용 한도(${quota.limit}회)를 모두 썼어요. PRO 플랜으로 업그레이드하면 제한 없이 쓸 수 있어요.`,
        quota,
        upgradeUrl: "/subscription",
      },
      { status: 402, headers: rateHeaders(rl.remaining, rl.resetAt) },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    messages?: unknown;
    model?: unknown;
  };
  const messages = parseMessages(body.messages);
  if (!messages) {
    return NextResponse.json(
      { error: "messages 배열(마지막은 user 역할)이 필요합니다." },
      { status: 400 },
    );
  }

  /* 모델 선택 — 알 수 없는 id 는 loop 쪽에서 기본 모델로 폴백된다 */
  const modelId = typeof body.model === "string" ? body.model.slice(0, 40) : undefined;

  const result = await runNuguzipAgent(messages, email, modelId, { maxRounds });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.configured
          ? `에이전트 실행에 실패했어요: ${result.error}`
          : "AI 키가 아직 설정되지 않아 에이전트를 쓸 수 없어요. 관리자에게 문의해 주세요.",
        configured: result.configured,
      },
      { status: result.configured ? 502 : 503, headers: rateHeaders(rl.remaining, rl.resetAt) },
    );
  }

  /* 4) 성공 요청 계측 — ai_analysis_runs(tool='agent') 에 라운드·모델 기록 */
  try {
    await recordAgentRun({
      email,
      question: messages[messages.length - 1].content,
      reply: result.reply,
      modelLabel: result.modelLabel,
      vendor: result.vendor,
      rounds: result.rounds,
      toolCalls: result.trace.length,
    });
  } catch (e) {
    logger.warn("[api/agent] 사용 기록 실패(응답은 정상 반환)", e);
  }

  return NextResponse.json(
    {
      reply: result.reply,
      trace: result.trace,
      vendor: result.vendor,
      model: result.modelLabel,
      disclaimer: DISCLAIMER,
      quota: { used: quota.used + 1, limit: quota.limit },
    },
    { headers: rateHeaders(rl.remaining, rl.resetAt) },
  );
}
