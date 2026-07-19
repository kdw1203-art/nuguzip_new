import { NextResponse } from "next/server";
import { getOpenAiApiKey, getOpenAiModel } from "@/lib/ai/env-keys";
import { buildAiPublicContext } from "@/lib/ai/public-data-context";
import { WOODONG_AI_SYSTEM, stubReply } from "@/lib/ai/system-prompt";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_MESSAGES = 24;
const MAX_CONTENT = 12_000;

function trimMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: string }).role;
    const content = String((m as { content?: unknown }).content ?? "").slice(
      0,
      MAX_CONTENT,
    );
    if (!content.trim()) continue;
    if (role !== "user" && role !== "assistant") continue;
    out.push({ role, content: content.trim() });
  }
  if (out.length === 0) return null;
  return out;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const b = body as {
    messages?: unknown;
    district?: string;
    intent?: string;
    tool?: string;
  };
  const messages = trimMessages(b.messages);
  if (!messages) {
    return NextResponse.json(
      { error: "messages 배열에 user/assistant 역할의 텍스트가 필요합니다." },
      { status: 400 },
    );
  }

  const apiKey = getOpenAiApiKey();
  const model = getOpenAiModel();

  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  let contextBlock = "";
  const district = String(b.district ?? "").trim();
  if (district) {
    try {
      const ctx = await buildAiPublicContext("ai-diagnosis", {
        regionDistrictId: district,
        intent: b.intent ?? "실거주",
      });
      if (ctx?.plans?.length) {
        contextBlock = `\n\n[공공데이터 컨텍스트]\n${ctx.plans
          .map((p) => `- ${p.title} (${p.planId}, ${p.mode}): ${p.summary}`)
          .join("\n")}\n${ctx.disclaimer}`;
      }
    } catch {
      /* optional */
    }
  }

  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      source: "stub" as const,
      reply: stubReply(lastUser?.content ?? ""),
    });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        max_tokens: 1400,
        messages: [
          { role: "system", content: WOODONG_AI_SYSTEM + contextBlock },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    const data = (await res.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };

    if (!res.ok) {
      const msg = data.error?.message ?? res.statusText;
      logger.error("[ai/chat]", res.status, msg);
      return NextResponse.json({
        ok: true,
        source: "stub" as const,
        reply: stubReply(
          lastUser?.content ?? "",
          `OpenAI 호출에 실패했습니다 (${res.status}). 잠시 후 다시 시도하거나 키·모델명을 확인해 주세요.`,
        ),
      });
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json({
        ok: true,
        source: "stub" as const,
        reply: stubReply(lastUser?.content ?? ""),
      });
    }

    return NextResponse.json({
      ok: true,
      source: "openai" as const,
      reply,
      model,
    });
  } catch (e) {
    logger.error("[ai/chat]", e);
    return NextResponse.json({
      ok: true,
      source: "stub" as const,
      reply: stubReply(
        lastUser?.content ?? "",
        "네트워크 오류로 AI 응답을 가져오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
      ),
    });
  }
}
