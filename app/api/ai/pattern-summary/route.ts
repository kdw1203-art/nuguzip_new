import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listPresets, listRuns } from "@/lib/ai/presets-store";
import { buildStubMarkdown } from "@/lib/ai/analysis-engine";
import { defaultModelIdFromEnv, getModelOption } from "@/lib/ai/llm-models";
import { callLlmChat, type LlmMessage } from "@/lib/ai/llm-provider";
import { isOpenAiConfigured } from "@/lib/ai/env-keys";
import { getServiceSupabase } from "@/lib/supabase/service";
import { fetchNationalPlan } from "@/lib/national-data/fetch";
import { parseDistrict } from "@/lib/inspection/public-data-context";
import { listNotes } from "@/lib/inspection/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeText(v: string, max = 80): string {
  return v
    .replace(/[^\w\s가-힣.,·:/()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function buildMinimizedDigest(
  presets: Awaited<ReturnType<typeof listPresets>>,
  runs: Awaited<ReturnType<typeof listRuns>>,
) {
  const toolCounts = runs.reduce<Record<string, number>>((acc, run) => {
    acc[run.tool] = (acc[run.tool] ?? 0) + 1;
    return acc;
  }, {});
  return {
    presetCount: presets.length,
    runCount: runs.length,
    toolsUsed: Object.keys(toolCounts),
    toolCounts,
    recentPresetLabels: presets.slice(0, 8).map((p) => ({
      tool: p.tool,
      title: safeText(p.title, 48),
      pinned: p.pinned,
    })),
    recentRunSummaries: runs.slice(0, 8).map((r) => ({
      tool: r.tool,
      at: r.createdAt,
      platform: r.platform,
      headline: safeText(r.structuredSummary?.headline ?? "", 80),
      tags: (r.structuredSummary?.tags ?? []).slice(0, 5).map((tag) => safeText(tag, 24)),
    })),
    objectiveKeyHints: presets.slice(0, 6).map((p) => ({
      tool: p.tool,
      keys: Object.keys(p.objective ?? {})
        .filter((key) => /region|complex|goal|risk|budget|txType|horizon/i.test(key))
        .slice(0, 8),
    })),
  };
}

function buildRtmsDeltaText(
  marketContext: Array<{ district?: string; summary?: string }>,
): string {
  if (!marketContext.length) return "관심 지역 실거래 스냅샷이 없습니다.";
  if (marketContext.length === 1) {
    const m = marketContext[0];
    return `${m.district ?? "지역"}: ${m.summary ?? "요약 없음"}`;
  }
  return marketContext
    .map((m) => `${m.district ?? "지역"} ${m.summary ?? ""}`.trim())
    .join(" · ");
}

function buildHeatSummary(input: {
  notes: Awaited<ReturnType<typeof listNotes>>;
  watchRegions: string[];
  marketContext: Array<{ district?: string; summary?: string }>;
}) {
  const districtFrequency: Record<string, number> = {};
  for (const n of input.notes) {
    const d = parseDistrict(n.region ?? "");
    if (d) districtFrequency[d] = (districtFrequency[d] ?? 0) + 1;
  }
  return {
    districtFrequency,
    watchRegions: input.watchRegions,
    rtmsDeltaText: buildRtmsDeltaText(input.marketContext),
  };
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let modelId = defaultModelIdFromEnv();
  try {
    const b = (await req.json()) as { modelId?: string };
    if (typeof b.modelId === "string" && b.modelId.trim()) modelId = b.modelId.trim();
  } catch {
    /* optional body */
  }

  const [presets, runs] = await Promise.all([listPresets(email), listRuns(email, 30)]);

  const digest = buildMinimizedDigest(presets, runs);

  const sb = getServiceSupabase();
  let marketContext: unknown[] = [];
  const districtSet = new Set<string>();
  const watchRegions: string[] = [];

  const notes = await listNotes(email);
  for (const n of notes.slice(0, 20)) {
    const d = parseDistrict(n.region ?? "");
    if (d) districtSet.add(d);
  }

  if (sb) {
    const { data } = await sb
      .from("app_users")
      .select("watch_regions")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    if (Array.isArray(data?.watch_regions)) {
      for (const r of data.watch_regions as Array<{ district?: string }>) {
        const d = parseDistrict(String(r.district ?? ""));
        if (d) {
          districtSet.add(d);
          if (!watchRegions.includes(d)) watchRegions.push(d);
        }
      }
    }
  }

  const regions = [...districtSet].slice(0, 3);
  type MarketSlice = { district?: string; summary?: string };
  let marketSlices: MarketSlice[] = [];
  if (regions.length) {
    const rtms = await Promise.allSettled(
      regions.map((d) => fetchNationalPlan("molit-apt-sale", { district: d, limit: 3 })),
    );
    marketContext = rtms
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchNationalPlan>>> => r.status === "fulfilled")
      .map((r, i) => ({
        planId: r.value.planId,
        district: regions[i],
        mode: r.value.mode,
        summary: r.value.summary,
        items: r.value.items.slice(0, 2),
      }));
    marketSlices = marketContext as MarketSlice[];
  }

  const heatSummary = buildHeatSummary({ notes, watchRegions, marketContext: marketSlices });

  const option = getModelOption(modelId) ?? getModelOption(defaultModelIdFromEnv());
  if (!option) {
    return NextResponse.json({
      ok: true,
      source: "stub" as const,
      heatSummary,
      markdown: buildStubMarkdown("ai-diagnosis", {
        digest,
        _notice: "모델 설정이 없어 규칙 기반 요약을 반환했습니다.",
      }),
    });
  }

  const messages: LlmMessage[] = [
    {
      role: "system",
      content:
        "당신은 고객의 부동산 AI 분석 이력을 읽고, 투자 성향·관심 패턴·고려 단지 후보를 한국어 마크다운으로 요약합니다. 추측은 '추정'으로 표시하고, 과장 금지.",
    },
    {
      role: "user",
      content: [
        "아래 JSON은 개인정보와 자유입력 원문을 제거한 최소 AI 분석 활동 요약입니다.",
        "```json",
        JSON.stringify({ digest, marketContext }, null, 2).slice(0, 12_000),
        "```",
        "",
        "다음 섹션으로 답하세요:",
        "## 한 줄 요약",
        "## 투자·거주 성향 (추정)",
        "## 반복된 관심·분석 패턴",
        "## 고려 중인 단지·지역 후보 (데이터에 기반해 추론)",
        "## 다음에 하면 좋은 액션 5가지",
      ].join("\n"),
    },
  ];

  const hasOpenAI = isOpenAiConfigured();
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  if (option.vendor === "openai" && !hasOpenAI) {
    return NextResponse.json({
      ok: true,
      source: "stub" as const,
      heatSummary,
      markdown: buildStubMarkdown("ai-diagnosis", { digest, _notice: "OpenAI 키 없음" }),
    });
  }
  if (option.vendor === "anthropic" && !hasAnthropic) {
    return NextResponse.json({
      ok: true,
      source: "stub" as const,
      heatSummary,
      markdown: buildStubMarkdown("ai-diagnosis", { digest, _notice: "Anthropic 키 없음" }),
    });
  }

  const result = await callLlmChat(option, messages);
  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      source: "stub" as const,
      heatSummary,
      markdown: buildStubMarkdown("ai-diagnosis", { digest, _llmError: result.error }),
    });
  }

  return NextResponse.json({
    ok: true,
    source: result.vendor,
    model: result.apiModel,
    heatSummary,
    markdown: result.text,
  });
}
