import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getOpenAiApiKey, getOpenAiModel } from "@/lib/ai/env-keys";

export const runtime = "nodejs";

type Side = {
  name?: string;
  tx_count_12m?: number;
  safety_index?: number;
};

async function llmCompareNarrative(input: {
  left: Side;
  right: Side;
  intent: string;
  winner: "left" | "right" | "tie";
  scoreL: number;
  scoreR: number;
}): Promise<string | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;
  const model = getOpenAiModel();
  const prompt = `두 후보를 ${input.intent} 관점에서 1문단(3~4문장)으로 비교 요약하세요. 투자 권유·과장 금지.
A: ${input.left.name ?? "A"} (거래량12M ${input.left.tx_count_12m ?? 0}, 안전 ${input.left.safety_index ?? 0})
B: ${input.right.name ?? "B"} (거래량12M ${input.right.tx_count_12m ?? 0}, 안전 ${input.right.safety_index ?? 0})
종합점수 A=${input.scoreL.toFixed(1)} B=${input.scoreR.toFixed(1)}, 우세=${input.winner}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 280,
        messages: [
          { role: "system", content: "부동산 비교 분석가. 한국어. 참고용." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: {
    left?: Side;
    right?: Side;
    intent?: string;
  };
  try {
    body = (await req.json()) as {
      left?: Side;
      right?: Side;
      intent?: string;
    };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { left, right, intent } = body;
  const ln = left?.tx_count_12m ?? 0;
  const rn = right?.tx_count_12m ?? 0;
  const ls = left?.safety_index ?? 0;
  const rs = right?.safety_index ?? 0;
  const scoreL = ln * 0.4 + ls * 0.6;
  const scoreR = rn * 0.4 + rs * 0.6;
  const winner: "left" | "right" | "tie" =
    scoreL > scoreR ? "left" : scoreR > scoreL ? "right" : "tie";

  const ruleSummary =
    winner === "tie"
      ? `${left?.name ?? "A"}와 ${right?.name ?? "B"}는 현재 지표상 팽팽합니다.`
      : winner === "left"
        ? `${left?.name ?? "A"}가 ${right?.name ?? "B"} 대비 현재 조건에서 우세합니다.`
        : `${right?.name ?? "B"}가 ${left?.name ?? "A"} 대비 현재 조건에서 우세합니다.`;

  const narrative = await llmCompareNarrative({
    left: left ?? {},
    right: right ?? {},
    intent: intent ?? "실거주",
    winner,
    scoreL,
    scoreR,
  });

  return NextResponse.json({
    intent: intent ?? "실거주",
    winner,
    summary: narrative ?? ruleSummary,
    narrative: narrative ?? null,
    reasons: [
      "거래량(12M) 대비 안정성",
      "생활권·안전 지표 균형",
      "리스크 플래그 수 비교",
    ],
    evidence_refs: [
      { metric: "tx_count_12m", left: ln, right: rn, mode: "sample" },
      { metric: "safety_index", left: ls, right: rs, mode: "sample" },
    ],
  });
}
