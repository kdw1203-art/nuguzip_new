/**
 * AI 에이전트 — 플랜별 월 사용 한도 + 사용 기록.
 *
 * 임장노트 AI 한도(lib/inspection/quota.ts)와 같은 체계를 따르되, 카운터를
 * 별도 테이블에 두지 않고 `ai_analysis_runs` 의 tool='agent' 기록 자체를
 * 사용량 원장으로 쓴다 — 기록(감사)과 계측(한도)이 한 곳에서 일치한다.
 */
import { appendRun } from "@/lib/ai/presets-store";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { getUserPlanTier } from "@/lib/inspection/quota";
import type { PlanTier } from "@/lib/subscriptions/access-gate";
import { monthlyLimitsAsPlanTiers } from "@/lib/subscriptions/access";
import { getServiceSupabase } from "@/lib/supabase/service";

/** ai_analysis_runs.tool 에 기록하는 에이전트 전용 키 */
export const AGENT_USAGE_TOOL_KEY = "agent";

/** 플랜별 월 한도 — null 은 무제한. FEATURE_RULES.ai_agent 에서 유도
    (한도 숫자의 단일 출처 — 항목 35). */
export const AGENT_MONTHLY_LIMITS: Record<PlanTier, number | null> =
  monthlyLimitsAsPlanTiers("ai_agent");

function monthStartIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

/** 이번 달 에이전트 사용 횟수 — ai_analysis_runs(tool='agent') 카운트 */
export async function getMonthlyAgentUsage(email: string): Promise<number> {
  const sb = getServiceSupabase();
  /* 로컬에서만 관대한 폴백. 프로덕션에서 키가 없으면 fail-closed —
     0("한 번도 안 씀")을 돌려주면 유료 한도가 조용히 무제한이 된다.
     (lib/inspection/quota.ts 와 동일한 판단) */
  if (!sb) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY 미설정 — 사용량을 셀 수 없어 에이전트 한도 판정을 중단합니다.",
      );
    }
    return 0;
  }
  const { count, error } = await sb
    .from("ai_analysis_runs")
    .select("id", { count: "exact", head: true })
    .eq("author_email", email.trim().toLowerCase())
    .eq("tool", AGENT_USAGE_TOOL_KEY)
    .gte("created_at", monthStartIso());
  /* 조회 실패를 0으로 누르면 "이번 달 0회 사용"이 되어 유료 한도가 통째로
     열린다 — 조회 실패는 실패로 던진다(호출자가 503). lib/inspection/quota.ts
     · lib/ai/presets-store.ts 가 같은 이유로 이미 throw 한다. */
  if (error) {
    throw new Error(`ai_analysis_runs 사용량 조회 실패: ${error.message}`);
  }
  return Number(count ?? 0);
}

export async function checkAgentQuota(email: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number | null;
  plan: PlanTier;
}> {
  const plan = await getUserPlanTier(email);
  const limit = AGENT_MONTHLY_LIMITS[plan];
  const used = await getMonthlyAgentUsage(email);
  if (limit === null) return { allowed: true, used, limit, plan };
  return { allowed: used < limit, used, limit, plan };
}

/**
 * 성공한 에이전트 요청을 ai_analysis_runs 에 남긴다(사용량 +1 겸용).
 * 라운드 수·모델·질문을 함께 기록해 운영 시 비용·품질 추적이 가능하다.
 */
export async function recordAgentRun(input: {
  email: string;
  question: string;
  reply: string;
  modelLabel: string;
  vendor: "openai" | "anthropic";
  rounds: number;
  toolCalls: number;
}): Promise<void> {
  await appendRun({
    authorEmail: input.email,
    /* 'agent' 는 워크벤치 도구 union 밖의 별도 키 — DB tool 컬럼은 text 라 안전하고,
       UI 쪽 getToolIdentity 는 미지 id 에 FALLBACK 을 반환한다. */
    tool: AGENT_USAGE_TOOL_KEY as AiAnalysisToolId,
    inputSnapshot: {
      question: input.question.slice(0, 500),
      rounds: input.rounds,
      toolCalls: input.toolCalls,
      vendor: input.vendor,
    },
    modelId: input.modelLabel,
    source: "agent",
    markdown: input.reply,
  });
}
