/**
 * 누구집 AI 에이전트 — tool-calling 루프.
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
  AGENT_TOOLS,
  executeAgentTool,
  type ToolTraceEntry,
} from "@/lib/agent/tools";

const ROUNDS = 4;
const MAX_OUT = 1200;

export const AGENT_SYSTEM_PROMPT = `당신은 "누구집 AI 에이전트"입니다. 누구집(nuguzip.com)은 임장(현장 방문) 기록을 판단 근거로 만드는 한국 부동산 서비스입니다.

절대 규칙 — 사실 우선:
1. 시세·거래량·점수 등 모든 숫자는 반드시 도구 조회 결과에서만 인용합니다. 도구가 반환하지 않은 숫자를 기억이나 추정으로 말하지 않습니다.
2. 도구가 "데이터 없음"을 반환하면 없다고 말합니다. 없는 데이터를 메워서 답하지 않습니다.
3. 사용자의 임장노트에 대한 질문은 list_my_notes → 필요 시 get_note_detail 순서로 실제 기록을 읽고 답합니다.
4. 단지 시세는 search_complex → get_complex_stats, 지역 시장은 get_region_market 을 사용합니다.
5. 매수·매도를 지시하지 않습니다. 데이터를 보여주고 사용자가 판단하도록 돕습니다. 필요하면 "직접 임장으로 확인할 것"을 권합니다.
6. 한국어로, 간결하게(대개 6문장 이내), 인용한 수치에는 기준 시점을 붙입니다(예: "최근 6개월 평균 12.4억").
7. 노트 기록과 실거래 데이터가 서로 다르게 말하면 둘 다 보여줍니다 — 기록은 사용자의 관찰, 실거래는 시장의 사실입니다.`;

export type AgentMessage = { role: "user" | "assistant"; content: string };

export type AgentRunResult =
  | { ok: true; reply: string; trace: ToolTraceEntry[]; vendor: "openai" | "anthropic" }
  | { ok: false; configured: boolean; error: string };

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
): Promise<AgentRunResult> {
  const model = getOpenAiModel();
  const trace: ToolTraceEntry[] = [];
  const convo: OaMessage[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const tools = AGENT_TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  for (let round = 0; round <= ROUNDS; round += 1) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: MAX_OUT,
        messages: convo,
        // 마지막 라운드에는 도구를 빼서 반드시 최종 답을 만들게 한다
        ...(round < ROUNDS ? { tools } : {}),
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      choices?: { message?: { content?: string | null; tool_calls?: OaToolCall[] } }[];
    } | null;
    if (!res.ok || !data?.choices?.length) {
      return { ok: false, configured: true, error: data?.error?.message ?? `OpenAI ${res.status}` };
    }
    const msg = data.choices[0].message ?? {};
    const calls = msg.tool_calls ?? [];

    if (calls.length === 0) {
      const text = (msg.content ?? "").trim();
      if (!text) return { ok: false, configured: true, error: "빈 응답" };
      return { ok: true, reply: text, trace, vendor: "openai" };
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
): Promise<AgentRunResult> {
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-20241022";
  const trace: ToolTraceEntry[] = [];
  const convo: AnMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const tools = AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  for (let round = 0; round <= ROUNDS; round += 1) {
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
        ...(round < ROUNDS ? { tools } : {}),
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      content?: AnContent[];
      stop_reason?: string;
    } | null;
    if (!res.ok || !data?.content) {
      return { ok: false, configured: true, error: data?.error?.message ?? `Anthropic ${res.status}` };
    }

    const toolUses = data.content.filter((c): c is Extract<AnContent, { type: "tool_use" }> => c.type === "tool_use");
    if (toolUses.length === 0 || data.stop_reason !== "tool_use") {
      const text = data.content
        .filter((c): c is Extract<AnContent, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim();
      if (!text) return { ok: false, configured: true, error: "빈 응답" };
      return { ok: true, reply: text, trace, vendor: "anthropic" };
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
  return { ok: false, configured: true, error: "도구 호출이 반복돼 답을 만들지 못했어요." };
}

/* ---------- 진입점 ---------- */

export async function runNuguzipAgent(
  messages: AgentMessage[],
  userEmail: string,
): Promise<AgentRunResult> {
  const openai = getOpenAiApiKey();
  if (openai) return runOpenAiLoop(openai, messages, userEmail);
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropic) return runAnthropicLoop(anthropic, messages, userEmail);
  return {
    ok: false,
    configured: false,
    error: "AI 키(OPENAI_API_KEY 또는 ANTHROPIC_API_KEY)가 설정되지 않았습니다.",
  };
}
