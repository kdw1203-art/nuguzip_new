import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { detectShellFromUserAgent } from "@/lib/platform-shell";
import {
  buildAnalysisMessages,
  buildInternalAnalysisMarkdown,
  buildStubMarkdown,
} from "@/lib/ai/analysis-engine";
import { buildAiPublicContext, evidenceRefsFromPublicContext } from "@/lib/ai/public-data-context";
import { defaultModelIdFromEnv, getModelOption } from "@/lib/ai/llm-models";
import { callLlmChat } from "@/lib/ai/llm-provider";
import { appendRun, getPreset, type AiRunStructuredSummary } from "@/lib/ai/presets-store";
import { isAnthropicConfigured, isOpenAiConfigured } from "@/lib/ai/env-keys";
import {
  appendAiRunWithinQuota,
  checkAiAnalysisQuota,
  resolveQuotaPlan,
} from "@/lib/subscriptions/usage-summary";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT = 48_000;

function normalizeInputValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalizeInputValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = normalizeInputValue(val);
    }
    return out;
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (t && /^-?\d+(\.\d+)?$/.test(t)) {
      return Number(t);
    }
    return v;
  }
  return v;
}

function buildStructuredSummary(
  markdown: string,
  input: Record<string, unknown>,
): AiRunStructuredSummary {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const headline = plain.slice(0, 90) || "AI 분석 결과가 생성되었습니다.";
  const bullets = markdown
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 12)
    .slice(0, 5);
  const rawScore =
    typeof input.score === "number"
      ? input.score
      : typeof input.aiScore === "number"
        ? input.aiScore
        : null;
  const tags = Object.keys(input)
    .filter((k) => /region|complex|goal|risk|txType/i.test(k))
    .slice(0, 6);
  return {
    headline,
    bullets: bullets.length ? bullets : [headline],
    score: rawScore != null ? Math.max(0, Math.min(100, Math.round(rawScore))) : null,
    tags,
  };
}

async function persistRunOr403(
  email: string,
  sessionPlan: string | null | undefined,
  input: Parameters<typeof appendRun>[0],
): Promise<NextResponse | null> {
  const result = await appendAiRunWithinQuota(email, sessionPlan, input);
  if (!result.ok) {
    return NextResponse.json(result.body, { status: 403 });
  }
  return null;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const tool = body.tool;
  if (!isAiAnalysisToolId(tool as string)) {
    return NextResponse.json({ error: "유효하지 않은 도구입니다." }, { status: 400 });
  }

  const tid = tool as AiAnalysisToolId;
  const rawInput = body.input;
  const input: Record<string, unknown> =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? (normalizeInputValue(rawInput) as Record<string, unknown>)
      : {};

  const raw = JSON.stringify(input);
  if (raw.length > MAX_INPUT) {
    return NextResponse.json({ error: "입력이 너무 깁니다." }, { status: 400 });
  }

  const session = await auth();
  const email = session?.user?.email ?? null;
  const sessionPlan = session?.user?.plan ?? null;
  const shell = detectShellFromUserAgent(req.headers.get("user-agent"));
  const presetId = typeof body.presetId === "string" ? body.presetId.trim() : "";
  const skipExternalLlm =
    body.skipExternalLlm === true || body.skipExternalLlm === "true";

  if (!skipExternalLlm && !email) {
    return NextResponse.json(
      { error: "AI 분석을 실행하려면 로그인이 필요합니다.", code: "LOGIN_REQUIRED" },
      { status: 401 },
    );
  }

  if (email && !skipExternalLlm) {
    const plan = await resolveQuotaPlan(email, sessionPlan);
    const quota = await checkAiAnalysisQuota(email, plan);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: quota.message,
          code: "QUOTA_EXCEEDED",
          requiredTier: quota.requiredTier === "basic" ? "pro" : quota.requiredTier,
          usage: { used: quota.used, limit: quota.limit },
        },
        { status: 403 },
      );
    }
  }

  if (presetId && email) {
    const p = await getPreset(presetId, email);
    if (!p) {
      return NextResponse.json({ error: "프리셋을 찾을 수 없습니다." }, { status: 400 });
    }
    if (p.tool !== tid) {
      return NextResponse.json({ error: "프리셋 도구와 요청 도구가 일치하지 않습니다." }, { status: 400 });
    }
  } else if (presetId && !email) {
    return NextResponse.json({ error: "프리셋을 쓰려면 로그인이 필요합니다." }, { status: 401 });
  }

  if (skipExternalLlm) {
    const publicContext = await buildAiPublicContext(tid, input);
    const evidence_refs = evidenceRefsFromPublicContext(publicContext);
    let markdown = buildInternalAnalysisMarkdown(tid, input);
    if (publicContext?.plans?.length) {
      markdown += [
        "",
        "## 공공데이터 참고",
        publicContext.plans
          .slice(0, 6)
          .map((p) => `- **${p.title}** (${p.mode}): ${p.summary}`)
          .join("\n"),
        "",
        publicContext.disclaimer,
      ].join("\n");
    }
    const requested = typeof body.modelId === "string" ? body.modelId.trim() : "";
    const modelId = requested || "internal";
    const structuredSummary = buildStructuredSummary(markdown, input);
    if (email) {
      const denied = await persistRunOr403(email, sessionPlan, {
        authorEmail: email,
        presetId: presetId || null,
        tool: tid,
        inputSnapshot: input,
        publicContextSnapshot: publicContext
          ? (publicContext as unknown as Record<string, unknown>)
          : null,
        modelId,
        source: "internal",
        platform: shell,
        structuredSummary,
        markdown,
      });
      if (denied) return denied;
    }
    return NextResponse.json({
      ok: true,
      source: "internal" as const,
      degraded: false,
      reasonCode: null,
      model: "internal",
      structuredSummary,
      evidence_refs,
      markdown,
    });
  }

  const requested = typeof body.modelId === "string" ? body.modelId.trim() : "";
  const modelId = requested || defaultModelIdFromEnv();
  const option = getModelOption(modelId) ?? getModelOption(defaultModelIdFromEnv());
  if (!option) {
    const publicContext = await buildAiPublicContext(tid, input);
    const evidence_refs = evidenceRefsFromPublicContext(publicContext);
    const markdown = buildStubMarkdown(tid, {
      ...input,
      _notice: "모델 설정이 없어 규칙 기반 안내를 반환했습니다.",
    });
    const structuredSummary = buildStructuredSummary(markdown, input);
    if (email) {
      const denied = await persistRunOr403(email, sessionPlan, {
        authorEmail: email,
        presetId: presetId || null,
        tool: tid,
        inputSnapshot: input,
        publicContextSnapshot: publicContext
          ? (publicContext as unknown as Record<string, unknown>)
          : null,
        modelId: "stub",
        source: "stub",
        platform: shell,
        structuredSummary,
        markdown,
      });
      if (denied) return denied;
    }
    return NextResponse.json({
      ok: true,
      source: "stub" as const,
      degraded: true,
      reasonCode: "MODEL_OPTION_NOT_FOUND",
      model: "stub",
      evidence_refs,
      structuredSummary,
      markdown,
    });
  }

  const publicContext = await buildAiPublicContext(tid, input);
  const evidence_refs = evidenceRefsFromPublicContext(publicContext);
  const messages = buildAnalysisMessages(tid, input, publicContext);

  const hasOpenAI = isOpenAiConfigured();
  const hasAnthropic = isAnthropicConfigured();

  let markdown: string;
  let source: string;
  let apiModel = option.apiModel;

  if (option.vendor === "openai" && !hasOpenAI) {
    source = "stub";
    markdown = buildStubMarkdown(tid, {
      ...input,
      _notice:
        "OpenAI API 키가 없어 규칙 기반 안내만 반환했습니다. OPENAI_API_KEY(또는 OPENAI_KEY)를 설정하세요.",
    });
  } else if (option.vendor === "anthropic" && !hasAnthropic) {
    source = "stub";
    markdown = buildStubMarkdown(tid, {
      ...input,
      _notice: "Anthropic API 키가 없어 규칙 기반 안내만 반환했습니다. ANTHROPIC_API_KEY를 설정하세요.",
    });
  } else {
    const result = await callLlmChat(option, messages);
    if (!result.ok) {
      source = "stub";
      markdown = buildStubMarkdown(tid, {
        ...input,
        _llmError: result.error,
      });
    } else {
      source = result.vendor;
      apiModel = result.apiModel;
      markdown = result.text;
    }
  }

  const structuredSummary = buildStructuredSummary(markdown, input);
  if (email) {
    try {
      const denied = await persistRunOr403(email, sessionPlan, {
        authorEmail: email,
        presetId: presetId || null,
        tool: tid,
        inputSnapshot: input,
        publicContextSnapshot: publicContext
          ? (publicContext as unknown as Record<string, unknown>)
          : null,
        modelId,
        source,
        platform: shell,
        structuredSummary,
        markdown,
      });
      if (denied) return denied;
    } catch (e) {
      logger.error("[ai/analysis appendRun]", e);
    }
  }

  return NextResponse.json({
    ok: true,
    source,
    degraded: source === "stub",
    reasonCode:
      source === "stub"
        ? !hasOpenAI && option.vendor === "openai"
          ? "OPENAI_KEY_MISSING"
          : !hasAnthropic && option.vendor === "anthropic"
            ? "ANTHROPIC_KEY_MISSING"
            : "LLM_PROVIDER_ERROR"
        : null,
    model: apiModel,
    structuredSummary,
    evidence_refs,
    markdown,
  });
}
