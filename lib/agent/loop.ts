/**
 * 내집나우 AI 에이전트 — tool-calling 루프.
 *
 * 기존 `/api/ai/chat`(lib/ai/llm-provider)은 텍스트만 주고받아 시세를 물으면
 * 모델이 기억(=지어낸 값)으로 답할 수밖에 없었다. 이 루프는 모델에게 DB 조회
 * 도구를 쥐여 주고, "숫자는 도구 결과에서만"을 시스템 프롬프트로 강제한다.
 *
 * - OpenAI(function calling)·Anthropic(tool use) 둘 다 지원, 키 있는 쪽을 사용
 * - 최대 ROUNDS 라운드 · 라운드당 병렬 도구 호출 허용
 * - 키 미설정이면 지어내지 않고 configured:false 를 반환한다
 */
import { getOpenAiApiKey, getOpenAiModel } from "@/lib/ai/env-keys";
import {
  DEFAULT_ANTHROPIC_MODEL,
  getModelOption,
  LLM_MODEL_OPTIONS,
} from "@/lib/ai/llm-models";
import {
  AGENT_TOOLS,
  executeAgentTool,
  type ToolTraceEntry,
} from "@/lib/agent/tools";
import { logger } from "@/lib/log";

const ROUNDS = 4;
const MAX_OUT = 1200;

/**
 * 자체 모델 전환 스위치 — AGENT_LLM_BASE_URL 을 설정하면 OpenAI 호환 API 를
 * 제공하는 어떤 서버로도 에이전트가 붙는다(자체 vLLM/Ollama GPU 서버,
 * 업스테이지 솔라, 하이퍼클로바X 등). 코드 수정 없이 Vercel 환경변수
 * (AGENT_LLM_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL[, AGENT_LLM_MODELS])만
 * 바꾸면 된다. 미설정 시 기본은 OpenAI.
 */
function agentLlmBaseUrl(): string {
  const v = process.env.AGENT_LLM_BASE_URL?.trim().replace(/\/+$/, "");
  return v || "https://api.openai.com";
}

/** 자체(OpenAI 호환) 백엔드가 설정됐는지 — 설정 시 OpenAI 모델 카탈로그 대신 백엔드 모델 목록을 쓴다. */
function hasCustomBackend(): boolean {
  return Boolean(process.env.AGENT_LLM_BASE_URL?.trim());
}

/**
 * 자체 백엔드에서 선택 가능한 모델 목록 — `AGENT_LLM_MODELS`(콤마 구분).
 * 미설정이면 base URL 의 기본 모델(OPENAI_MODEL) 1개만 노출한다.
 */
function customBackendModelIds(): string[] {
  const csv = process.env.AGENT_LLM_MODELS?.trim();
  if (csv) {
    const ids = csv.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) return ids;
  }
  return [getOpenAiModel()];
}

export const AGENT_SYSTEM_PROMPT = `당신은 "내집나우 AI 에이전트"입니다. 내집나우(nuguzip.com)은 임장(현장 방문) 기록을 판단 근거로 만드는 한국 부동산 서비스입니다.

절대 규칙 — 사실 우선:
1. 시세·거래량·점수 등 모든 숫자는 반드시 도구 조회 결과에서만 인용합니다. 도구가 반환하지 않은 숫자를 기억이나 추정으로 말하지 않습니다.
2. 도구가 "데이터 없음"을 반환하면 없다고 말합니다. 없는 데이터를 메워서 답하지 않습니다.
3. 사용자의 임장노트에 대한 질문은 list_my_notes → 필요 시 get_note_detail 순서로 실제 기록을 읽고 답합니다.
4. 단지 시세는 search_complex → get_complex_stats, 지역 시장은 get_region_market 을 사용합니다.
5. 매수·매도를 지시하지 않습니다. 데이터를 보여주고 사용자가 판단하도록 돕습니다. 필요하면 "직접 임장으로 확인할 것"을 권합니다.
6. 한국어로, 간결하게(대개 6문장 이내), 인용한 수치에는 기준 시점을 붙입니다(예: "최근 6개월 평균 12.4억").
7. 노트 기록과 실거래 데이터가 서로 다르게 말하면 둘 다 보여줍니다 — 기록은 사용자의 관찰, 실거래는 시장의 사실입니다.
8. 지역·단지 시세 도구는 현재 수도권(서울·경기·인천) 실거래 기준입니다. 도구가 "지원하지 않는 지역"이라고 반환하면 그 사실을 그대로 알리고, 없는 지방 시세를 추정해 답하지 않습니다.`;

export type AgentMessage = { role: "user" | "assistant"; content: string };

export type AgentRunResult =
  | {
      ok: true;
      reply: string;
      trace: ToolTraceEntry[];
      vendor: "openai" | "anthropic";
      modelLabel: string;
      /** 최종 답까지 사용한 LLM 호출 라운드 수 (1 = 도구 없이 즉답) */
      rounds: number;
    }
  | { ok: false; configured: boolean; error: string };

/* ---------- 선택 가능한 모델 목록 ---------- */

export type AgentModelChoice = { id: string; label: string; description: string };

/**
 * 사용자에게 보여줄 모델 선택지 — 키가 설정된 벤더의 모델만 노출한다.
 * "default"는 운영 기본(OPENAI_MODEL / AGENT_LLM_BASE_URL 환경변수를 따름)으로,
 * 자체 모델·국산 API 로 전환해도 이 항목이 자동으로 그 모델을 가리킨다.
 */
export function listAgentModels(): AgentModelChoice[] {
  /* 자체 백엔드 모드 — OpenAI 카탈로그 대신 백엔드가 실제 서빙하는 모델만 노출 */
  if (hasCustomBackend()) {
    return customBackendModelIds().map((id, i) => ({
      id,
      label: id,
      description: i === 0 ? "자체 LLM 백엔드 · 기본" : "자체 LLM 백엔드",
    }));
  }

  const out: AgentModelChoice[] = [];
  const hasOpenAi = Boolean(getOpenAiApiKey());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (hasOpenAi || hasAnthropic) {
    out.push({
      id: "default",
      label: `기본 (${hasOpenAi ? getOpenAiModel() : "Claude"})`,
      description: "운영 기본 설정 · 빠른 응답",
    });
  }
  for (const m of LLM_MODEL_OPTIONS) {
    if (m.vendor === "openai" && !hasOpenAi) continue;
    if (m.vendor === "anthropic" && !hasAnthropic) continue;
    out.push({ id: m.id, label: m.label, description: m.description });
  }
  return out;
}

/* ---------- OpenAI function-calling 루프 ---------- */

type OaMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: OaToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type OaToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

async function runOpenAiLoop(
  key: string,
  messages: AgentMessage[],
  userEmail: string,
  model: string,
  maxRounds: number,
): Promise<AgentRunResult> {
  const trace: ToolTraceEntry[] = [];
  const convo: OaMessage[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const tools = AGENT_TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  for (let round = 0; round <= maxRounds; round += 1) {
    const res = await fetch(`${agentLlmBaseUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: MAX_OUT,
        messages: convo,
        // 마지막 라운드에는 도구를 빼서 반드시 최종 답을 만들게 한다
        ...(round < maxRounds ? { tools } : {}),
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      choices?: { message?: { content?: string | null; tool_calls?: OaToolCall[] } }[];
    } | null;
    if (!res.ok || !data?.choices?.length) {
      const error = data?.error?.message ?? `OpenAI ${res.status}`;
      logger.warn("[agent/loop] OpenAI 루프 실패", { model, round, error });
      return { ok: false, configured: true, error };
    }
    const msg = data.choices[0].message ?? {};
    const calls = msg.tool_calls ?? [];

    if (calls.length === 0) {
      const text = (msg.content ?? "").trim();
      if (!text) {
        logger.warn("[agent/loop] OpenAI 빈 응답", { model, round });
        return { ok: false, configured: true, error: "빈 응답" };
      }
      logger.info("[agent/loop] 완료", {
        vendor: "openai",
        model,
        rounds: round + 1,
        toolCalls: trace.length,
      });
      return { ok: true, reply: text, trace, vendor: "openai", modelLabel: model, rounds: round + 1 };
    }

    convo.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    for (const call of calls.slice(0, 4)) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        /* 빈 인자로 실행 → 실행기가 오류 JSON을 돌려준다 */
      }
      const { trace: t, resultJson } = await executeAgentTool(call.function.name, args, userEmail);
      trace.push(t);
      convo.push({ role: "tool", tool_call_id: call.id, content: resultJson });
    }
  }
  logger.warn("[agent/loop] OpenAI 라운드 초과", { model, maxRounds, toolCalls: trace.length });
  return { ok: false, configured: true, error: "도구 호출이 반복돼 답을 만들지 못했어요." };
}

/* ---------- Anthropic tool-use 루프 ---------- */

type AnContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnMessage = { role: "user" | "assistant"; content: string | AnContent[] };

async function runAnthropicLoop(
  key: string,
  messages: AgentMessage[],
  userEmail: string,
  model: string,
  maxRounds: number,
): Promise<AgentRunResult> {
  const trace: ToolTraceEntry[] = [];
  const convo: AnMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const tools = AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  for (let round = 0; round <= maxRounds; round += 1) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUT,
        system: AGENT_SYSTEM_PROMPT,
        messages: convo,
        ...(round < maxRounds ? { tools } : {}),
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      content?: AnContent[];
      stop_reason?: string;
    } | null;
    if (!res.ok || !data?.content) {
      const error = data?.error?.message ?? `Anthropic ${res.status}`;
      logger.warn("[agent/loop] Anthropic 루프 실패", { model, round, error });
      return { ok: false, configured: true, error };
    }

    const toolUses = data.content.filter((c): c is Extract<AnContent, { type: "tool_use" }> => c.type === "tool_use");
    if (toolUses.length === 0 || data.stop_reason !== "tool_use") {
      const text = data.content
        .filter((c): c is Extract<AnContent, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim();
      if (!text) {
        logger.warn("[agent/loop] Anthropic 빈 응답", { model, round });
        return { ok: false, configured: true, error: "빈 응답" };
      }
      logger.info("[agent/loop] 완료", {
        vendor: "anthropic",
        model,
        rounds: round + 1,
        toolCalls: trace.length,
      });
      return { ok: true, reply: text, trace, vendor: "anthropic", modelLabel: model, rounds: round + 1 };
    }

    convo.push({ role: "assistant", content: data.content });
    const results: AnContent[] = [];
    for (const use of toolUses.slice(0, 4)) {
      const { trace: t, resultJson } = await executeAgentTool(use.name, use.input ?? {}, userEmail);
      trace.push(t);
      results.push({ type: "tool_result", tool_use_id: use.id, content: resultJson });
    }
    convo.push({ role: "user", content: results });
  }
  logger.warn("[agent/loop] Anthropic 라운드 초과", { model, maxRounds, toolCalls: trace.length });
  return { ok: false, configured: true, error: "도구 호출이 반복돼 답을 만들지 못했어요." };
}

/* ---------- 진입점 ---------- */

export type AgentRunOptions = {
  /** 도구 사용 가능 라운드 상한 (기본 4, 1~4 로 클램프) — 레이트리밋 degraded 시 보수 운행용 */
  maxRounds?: number;
};

export async function runNuguzipAgent(
  messages: AgentMessage[],
  userEmail: string,
  modelId?: string,
  opts?: AgentRunOptions,
): Promise<AgentRunResult> {
  const maxRounds = Math.max(1, Math.min(opts?.maxRounds ?? ROUNDS, ROUNDS));
  const openai = getOpenAiApiKey();
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();

  /* 자체 백엔드 모드 — 카탈로그 모델 대신 백엔드 모델 목록(AGENT_LLM_MODELS)만 존중 */
  if (hasCustomBackend()) {
    if (!openai) {
      return {
        ok: false,
        configured: false,
        error: "AGENT_LLM_BASE_URL 은 설정됐지만 백엔드 키(OPENAI_API_KEY)가 없습니다.",
      };
    }
    const ids = customBackendModelIds();
    const chosen =
      modelId && modelId !== "default" && ids.includes(modelId) ? modelId : ids[0];
    return runOpenAiLoop(openai, messages, userEmail, chosen, maxRounds);
  }

  /* 사용자가 고른 모델 — 해당 벤더 키가 있을 때만 존중, 아니면 기본으로 폴백 */
  const opt = modelId && modelId !== "default" ? getModelOption(modelId) : null;
  if (opt?.vendor === "openai" && openai) {
    return runOpenAiLoop(openai, messages, userEmail, opt.apiModel, maxRounds);
  }
  if (opt?.vendor === "anthropic" && anthropic) {
    return runAnthropicLoop(anthropic, messages, userEmail, opt.apiModel, maxRounds);
  }

  if (openai) return runOpenAiLoop(openai, messages, userEmail, getOpenAiModel(), maxRounds);
  if (anthropic) {
    return runAnthropicLoop(
      anthropic,
      messages,
      userEmail,
      process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
      maxRounds,
    );
  }
  return {
    ok: false,
    configured: false,
    error: "AI 키(OPENAI_API_KEY 또는 ANTHROPIC_API_KEY)가 설정되지 않았습니다.",
  };
}
