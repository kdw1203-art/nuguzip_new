import "server-only";
import { buildLiveToolContext } from "@/lib/ai/live-context";
import { callOpenAiJsonSchema } from "@/lib/ai/structured-output";
import { getModelOption, defaultModelIdFromEnv } from "@/lib/ai/llm-models";
import { getOpenAiApiKey } from "@/lib/ai/env-keys";
import { withComplianceClause } from "@/lib/ai/compliance";
import { logger } from "@/lib/log";
import {
  ruleDraft,
  DRAFT_CHECK_AXES,
  DRAFT_SCHEMA,
  type NoteDraft,
  type NoteDraftInput,
  type DraftLevel,
} from "@/lib/ai/note-draft-core";

export type { NoteDraft, NoteDraftInput, DraftLevel };
export { DRAFT_CHECK_AXES };

export async function generateNoteDraft(input: NoteDraftInput): Promise<NoteDraft> {
  const ctx = await buildLiveToolContext({
    complexId: input.complexId ?? null,
    regionName: input.regionName,
  });
  const fallback = ruleDraft(input, ctx);

  /* 구조화 출력은 OpenAI 경로만 — 키가 없으면 rule 초안이 곧 결과다. */
  const modelOpt = getModelOption(defaultModelIdFromEnv());
  if (!getOpenAiApiKey() || !modelOpt || modelOpt.vendor !== "openai") {
    return fallback;
  }

  const system = withComplianceClause(
    [
      "당신은 한국 아파트 임장(현장 답사) 노트 작성을 돕는 어시스턴트다.",
      "규칙:",
      "1) 아래 [데이터 근거]에 있는 수치만 사용한다. 근거에 없는 가격·비율·개수를 지어내지 않는다.",
      "2) 점수(checks 9축·satisfaction)는 데이터로 뒷받침되는 축만 채운다. 데이터가 없는 축(예: 채광·소음·경사·보안·관리는 현장 확인 사항)은 null 로 둔다.",
      "3) 점수를 하나라도 냈으면 score_rationale 에 어떤 데이터로 추정했는지 적는다.",
      "4) memo 는 '방문 전 예습' 톤으로: 사전 메모 반영 → 데이터 근거 요약 → 현장에서 확인할 것. 과장·단정 금지, 투자 권유 금지.",
      "5) 모든 내용은 한국어. memo 는 700자 이내.",
    ].join("\n"),
  );
  const user = [
    `대상: ${input.aptName?.trim() || "(단지 미지정)"} / 지역: ${input.regionName}`,
    input.purpose ? `방문 목적: ${input.purpose}` : null,
    input.userMemo?.trim() ? `사용자 사전 메모: ${input.userMemo.trim()}` : null,
    "",
    "[데이터 근거]",
    ...(fallback.evidence.length > 0 ? fallback.evidence.map((e) => `- ${e}`) : ["- (수집된 근거 없음 — 점수는 전부 null 로)"]),
    "",
    "[데이터 조건부 확인 포인트(포함 권장)]",
    ...fallback.todo.map((t) => `- ${t}`),
  ]
    .filter((v) => v !== null)
    .join("\n");

  try {
    const r = await callOpenAiJsonSchema<{
      title: string;
      summary: string;
      memo: string;
      checks: Record<string, DraftLevel | null>;
      satisfaction: number | null;
      score_rationale: string | null;
      todo: string[];
    }>({
      model: modelOpt.apiModel,
      system,
      user,
      spec: DRAFT_SCHEMA as unknown as { name: string; schema: Record<string, unknown>; strict?: boolean },
      temperature: 0.4,
    });
    if (!r.ok) {
      logger.warn("[note-draft] LLM 실패 — rule 폴백", r.error);
      return fallback;
    }
    const d = r.data;
    const checks: NoteDraft["checks"] = {};
    for (const axis of DRAFT_CHECK_AXES) {
      const v = d.checks?.[axis];
      if (v === "좋음" || v === "보통" || v === "아쉬움") checks[axis] = v;
    }
    const sat =
      typeof d.satisfaction === "number" && Number.isFinite(d.satisfaction)
        ? Math.max(0, Math.min(10, Math.round(d.satisfaction * 2) / 2))
        : null;
    /* 점수는 근거 서술 없이는 받지 않는다 — 라벨 원칙의 서버측 강제 */
    const rationale = d.score_rationale?.trim() || null;
    const hasScores = Object.keys(checks).length > 0 || sat != null;
    return {
      title: d.title?.trim() || fallback.title,
      summary: (d.summary?.trim() || fallback.summary).slice(0, 120),
      memo: (d.memo?.trim() || fallback.memo).slice(0, 1400),
      checks: hasScores && rationale ? checks : {},
      satisfaction: hasScores && rationale ? sat : null,
      scoreRationale: hasScores && rationale ? rationale : null,
      todo: (Array.isArray(d.todo) && d.todo.length > 0 ? d.todo : fallback.todo)
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 8),
      evidence: fallback.evidence,
      llmUsed: true,
      model: modelOpt.apiModel,
    };
  } catch (e) {
    logger.warn("[note-draft] LLM 예외 — rule 폴백", e);
    return fallback;
  }
}
