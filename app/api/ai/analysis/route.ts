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
import { getServiceSupabase } from "@/lib/supabase/service";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { buildNumberWhitelist, guardLlmNumbers } from "@/lib/ai/insight-blocks";
import { AI_PROMPT_VERSION } from "@/lib/ai/system-prompt";

import { dbUnavailable } from "@/lib/api/db-unavailable";

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
): Promise<
  | { denied: NextResponse }
  | { denied: null; runId: string | null; usage: { used: number; limit: number | null } }
> {
  const result = await appendAiRunWithinQuota(email, sessionPlan, input);
  if (!result.ok) {
    return { denied: NextResponse.json(result.body, { status: 403 }) };
  }
  return { denied: null, runId: result.runId, usage: result.usage };
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
    /* 한도를 못 셌는데 통과시키면 무제한이 되고, 0 으로 세면 유료 사용자를
       막는다. 둘 다 사실이 아니므로 "지금은 확인할 수 없다"고 답한다. */
    let quota: Awaited<ReturnType<typeof checkAiAnalysisQuota>>;
    try {
      quota = await checkAiAnalysisQuota(email, plan);
    } catch (e) {
      return dbUnavailable("ai-analysis-quota", e);
    }
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
    let p: Awaited<ReturnType<typeof getPreset>>;
    try {
      p = await getPreset(presetId, email);
    } catch (e) {
      return dbUnavailable("ai-analysis-preset", e);
    }
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
    let runId: string | null = null;
    let usage: { used: number; limit: number | null } | null = null;
    if (email) {
      const persisted = await persistRunOr403(email, sessionPlan, {
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
      if (persisted.denied) return persisted.denied;
      runId = persisted.runId;
      usage = persisted.usage;
    }
    /* [AI-45] 서버 계측 통일 — 실행·완료를 도구 축으로 기록 */
    await recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.AI_TOOL_RUN,
      userEmail: email ?? "anon",
      path: `/analysis/ai/${tid}`,
      metadata: { tool: tid, source: "internal", promptVersion: AI_PROMPT_VERSION },
    }).catch(() => {});
    return NextResponse.json({
      ok: true,
      source: "internal" as const,
      degraded: false,
      reasonCode: null,
      model: "internal",
      structuredSummary,
      evidence_refs,
      markdown,
      runId,
      usage,
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
    let runId: string | null = null;
    let usage: { used: number; limit: number | null } | null = null;
    if (email) {
      const persisted = await persistRunOr403(email, sessionPlan, {
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
      if (persisted.denied) return persisted.denied;
      runId = persisted.runId;
      usage = persisted.usage;
    }
    await recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.AI_RULE_FALLBACK,
      userEmail: email ?? "anon",
      path: `/analysis/ai/${tid}`,
      metadata: { tool: tid, reason: "MODEL_OPTION_NOT_FOUND" },
    }).catch(() => {});
    return NextResponse.json({
      ok: true,
      source: "stub" as const,
      degraded: true,
      reasonCode: "MODEL_OPTION_NOT_FOUND",
      model: "stub",
      evidence_refs,
      structuredSummary,
      markdown,
      runId,
      usage,
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

  /* [AI-48] 월 LLM 예산 가드 — 이번 달 외부 모델 실행 수가 상한을 넘으면
     조용히 과금이 늘지 않게 규칙 모드로 전환하고, 그 사실을 화면에 고지한다. */
  const llmMonthlyCap = Number(process.env.AI_LLM_MONTHLY_CAP ?? "500");
  let llmBudgetExceeded = false;
  if (email && Number.isFinite(llmMonthlyCap) && llmMonthlyCap > 0) {
    try {
      llmBudgetExceeded = (await countLlmRunsThisMonth()) >= llmMonthlyCap;
    } catch {
      llmBudgetExceeded = false; // 예산 집계 실패가 기능을 막으면 안 된다
    }
  }

  if (llmBudgetExceeded) {
    source = "stub";
    markdown = buildStubMarkdown(tid, {
      ...input,
      _notice: `이번 달 AI 서술 예산(${llmMonthlyCap}회)을 모두 사용해 규칙 기반 결과로 대신합니다. 다음 달에 자동으로 다시 열립니다.`,
    });
  } else if (option.vendor === "openai" && !hasOpenAI) {
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
      /* [AI-05] 문장 출처 라벨 — LLM 서술 전체를 명시 섹션으로 감싼다.
         [AI-08] 수치 환각 가드 — 입력·공공 컨텍스트에 없던 숫자를 검출해
         본문 위에 경고로 밝힌다(몰래 지우지 않고 드러낸다 — 정직 우선). */
      const whitelist = buildNumberWhitelist([
        input,
        publicContext as unknown,
      ]);
      const guard = guardLlmNumbers(result.text, whitelist);
      const guardNote = guard.ok
        ? ""
        : `\n> ⚠️ [수치 검증] 아래 서술에서 입력·공공데이터에 없는 숫자 ${guard.violations.length}개가 발견됐습니다(${guard.violations.slice(0, 4).join(", ")}${guard.violations.length > 4 ? " 외" : ""}). 해당 수치는 근거가 확인되지 않았으니 판단에 쓰지 마세요.\n`;
      markdown = `## [AI 서술] 외부 모델 해석\n${guardNote}\n${result.text}\n\n---\n_위 서술은 외부 LLM(${result.apiModel})이 작성한 해석이며, 수치의 원천은 함께 표시된 [규칙] 계산·근거 각주입니다._`;
    }
  }

  const structuredSummary = buildStructuredSummary(markdown, input);
  let runId: string | null = null;
  let usage: { used: number; limit: number | null } | null = null;
  if (email) {
    try {
      const persisted = await persistRunOr403(email, sessionPlan, {
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
      if (persisted.denied) return persisted.denied;
      runId = persisted.runId;
      usage = persisted.usage;
    } catch (e) {
      logger.error("[ai/analysis appendRun]", e);
    }
  }
  /* [AI-45] 완료/폴백 계측 */
  await recordFunnelEvent(req, {
    eventName:
      source === "stub" ? FUNNEL_EVENT.AI_RULE_FALLBACK : FUNNEL_EVENT.AI_LLM_COMPLETE,
    userEmail: email ?? "anon",
    path: `/analysis/ai/${tid}`,
    metadata: { tool: tid, source, model: apiModel, promptVersion: AI_PROMPT_VERSION },
  }).catch(() => {});

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
    runId,
    usage,
  });
}

/* [AI-48] 이번 달 외부 LLM 실행 수 — source 가 벤더명인 run 만 센다 */
async function countLlmRunsThisMonth(): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb) return 0;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count, error } = await sb
    .from("ai_analysis_runs")
    .select("*", { count: "exact", head: true })
    .in("source", ["openai", "anthropic"])
    .gte("created_at", monthStart.toISOString());
  if (error || typeof count !== "number") return 0;
  return count;
}
