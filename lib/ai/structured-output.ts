import { getOpenAiApiKey } from "@/lib/ai/env-keys";

export type JsonSchemaSpec = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

/**
 * OpenAI Chat Completions — response_format json_schema (Structured Outputs).
 * @see https://platform.openai.com/docs/guides/structured-outputs
 */
export async function callOpenAiJsonSchema<T = Record<string, unknown>>(input: {
  model: string;
  system: string;
  user: string;
  spec: JsonSchemaSpec;
  temperature?: number;
}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const key = getOpenAiApiKey();
  if (!key) return { ok: false, error: "OPENAI_API_KEY 미설정" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature ?? 0.3,
      max_tokens: 4096,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.spec.name,
          strict: input.spec.strict ?? true,
          schema: input.spec.schema,
        },
      },
    }),
  });

  const raw = (await res.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string; refusal?: string } }[];
  };

  if (!res.ok) {
    return { ok: false, error: raw.error?.message ?? res.statusText };
  }

  const content = raw.choices?.[0]?.message?.content?.trim();
  const refusal = raw.choices?.[0]?.message?.refusal;
  if (refusal) return { ok: false, error: refusal };
  if (!content) return { ok: false, error: "빈 JSON 응답" };

  try {
    return { ok: true, data: JSON.parse(content) as T };
  } catch {
    return { ok: false, error: "JSON 파싱 실패" };
  }
}

/** field_note_analysis — 전략 문서 온톨로지 대응 */
export const FIELD_NOTE_ANALYSIS_SCHEMA: JsonSchemaSpec = {
  name: "field_note_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      topSummary: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      weaknesses: { type: "array", items: { type: "string" } },
      mustVerify: { type: "array", items: { type: "string" } },
      followUpQuestions: { type: "array", items: { type: "string" } },
      scores: {
        type: "object",
        additionalProperties: false,
        properties: {
          transport: { type: "integer" },
          school: { type: "integer" },
          livability: { type: "integer" },
          condition: { type: "integer" },
          future_value: { type: "integer" },
        },
        required: ["transport", "school", "livability", "condition", "future_value"],
      },
      redevelopment: {
        type: "object",
        additionalProperties: false,
        properties: {
          projectType: { type: "string" },
          currentStage: { type: "string" },
          knownFacts: { type: "array", items: { type: "string" } },
          uncertainties: { type: "array", items: { type: "string" } },
          keyRisks: { type: "array", items: { type: "string" } },
          nextDocumentsToCheck: { type: "array", items: { type: "string" } },
        },
        required: [
          "projectType",
          "currentStage",
          "knownFacts",
          "uncertainties",
          "keyRisks",
          "nextDocumentsToCheck",
        ],
      },
    },
    required: [
      "topSummary",
      "strengths",
      "weaknesses",
      "mustVerify",
      "followUpQuestions",
      "scores",
    ],
  },
};
