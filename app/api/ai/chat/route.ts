import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOpenAiApiKey, getOpenAiModel } from "@/lib/ai/env-keys";
import { buildAiPublicContext } from "@/lib/ai/public-data-context";
import { WOODONG_AI_SYSTEM } from "@/lib/ai/system-prompt";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
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
  // 인증 필수 — 비로그인 호출은 401로 명확히 거절
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "AI 채팅은 로그인 후 이용할 수 있습니다.", code: "LOGIN_REQUIRED" },
      { status: 401 },
    );
  }

  // 사용자별 별도 버킷: 시간당 10회 (IP 버킷과 분리)
  const rl = rateLimit(`ai-chat:${email || getClientIp(req)}`, {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON 본문이 필요합니다." },
      { status: 400 },
    );
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
      { ok: false, error: "messages 배열에 user/assistant 역할의 텍스트가 필요합니다." },
      { status: 400 },
    );
  }

  const apiKey = getOpenAiApiKey();
  const model = getOpenAiModel();

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
    // 키 미설정 — 성공(200/stub)으로 뭉개지 않고 서비스 불가로 명확히 응답
    return NextResponse.json(
      {
        ok: false,
        error:
          "AI 답변 기능이 아직 준비 중이에요. 잠시 후 다시 시도해 주세요. 그동안은 지도·커뮤니티·리포트에서 자료를 확인할 수 있어요.",
        code: "AI_UNAVAILABLE",
      },
      { status: 503 },
    );
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
      return NextResponse.json(
        {
          ok: false,
          error: "AI 응답 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
          code: "UPSTREAM_ERROR",
        },
        { status: 502 },
      );
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json(
        {
          ok: false,
          error: "AI 응답이 비어 있어요. 질문을 조금 바꿔 다시 시도해 주세요.",
          code: "EMPTY_REPLY",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      source: "openai" as const,
      reply,
      model,
    });
  } catch (e) {
    logger.error("[ai/chat]", e);
    return NextResponse.json(
      {
        ok: false,
        error: "네트워크 오류로 AI 응답을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.",
        code: "NETWORK_ERROR",
      },
      { status: 502 },
    );
  }
}
