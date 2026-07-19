import type { LlmModelOption } from "@/lib/ai/llm-models";
import { getOpenAiApiKey } from "@/lib/ai/env-keys";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmCallResult =
  | { ok: true; text: string; vendor: "openai" | "anthropic"; apiModel: string }
  | { ok: false; error: string; vendor: "stub" };

const MAX_OUT = 4096;

export async function callLlmChat(
  option: LlmModelOption,
  messages: LlmMessage[],
): Promise<LlmCallResult> {
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content);
  const rest = messages.filter((m) => m.role !== "system");

  if (option.vendor === "openai") {
    const key = getOpenAiApiKey();
    if (!key) return { ok: false, error: "OPENAI_API_KEY(또는 OPENAI_KEY) 미설정", vendor: "stub" };
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: option.apiModel,
        temperature: 0.4,
        max_tokens: MAX_OUT,
        messages: [
          ...(sys.length ? [{ role: "system" as const, content: sys.join("\n\n") }] : []),
          ...rest.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });
    const data = (await res.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error?.message ?? res.statusText,
        vendor: "stub",
      };
    }
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, error: "빈 응답", vendor: "stub" };
    return { ok: true, text, vendor: "openai", apiModel: option.apiModel };
  }

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY 미설정", vendor: "stub" };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: option.apiModel,
      max_tokens: MAX_OUT,
      system: sys.join("\n\n") || undefined,
      messages: rest.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    }),
  });

  const data = (await res.json()) as {
    error?: { message?: string };
    content?: Array<{ type: string; text?: string }>;
  };

  if (!res.ok) {
    return {
      ok: false,
      error: data.error?.message ?? res.statusText,
      vendor: "stub",
    };
  }

  const block = data.content?.find((c) => c.type === "text");
  const text = block?.text?.trim();
  if (!text) return { ok: false, error: "빈 응답", vendor: "stub" };
  return { ok: true, text, vendor: "anthropic", apiModel: option.apiModel };
}
