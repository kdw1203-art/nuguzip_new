import type {
  Evidence,
  Observation,
  StructuredReport,
  FactorType,
  ConfidenceLevel,
} from "@/lib/inspection/ontology";
import type { InspectionSession, SessionMedia } from "@/lib/inspection/session-store";
import { defaultModelIdFromEnv, getModelOption } from "@/lib/ai/llm-models";
import {
  callOpenAiJsonSchema,
  FIELD_NOTE_ANALYSIS_SCHEMA,
} from "@/lib/ai/structured-output";
import { lensFromSession } from "@/lib/inspection/field-labels";

const FACTOR_KEYWORDS: Array<[FactorType, RegExp]> = [
  ["transport", /역|교통|버스|지하철|도보|정류/],
  ["school", /학교|학군|학원|초등|중등|고등/],
  ["parking", /주차|차량|주차장/],
  ["noise", /소음|조용|시끄/],
  ["commercial", /상가|마트|편의|생활/],
  ["condition", /외벽|노후|리모델|상태|누수/],
  ["future_value", /재개발|호재|개발|미래|상승/],
  ["livability", /일조|채광|동선|뷰|조망/],
  ["safety", /안전|범죄|치안/],
];

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function detectFactor(text: string): FactorType {
  for (const [factor, re] of FACTOR_KEYWORDS) {
    if (re.test(text)) return factor;
  }
  return "livability";
}

function detectSentiment(text: string): Observation["sentiment"] {
  if (/좋|장점|깨끗|넓|편|가깝|조용/.test(text)) return "positive";
  if (/나쁘|단점|좁|시끄|멀|부족|노후|빡빡/.test(text)) return "negative";
  return "neutral";
}

function extractObservationsFromText(
  text: string,
  evidenceId: string,
  sourceType: Observation["sourceType"],
): Observation[] {
  const sentences = text
    .split(/[.!?。\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  return sentences.slice(0, 12).map((statement) => ({
    id: uid("obs"),
    factor: detectFactor(statement),
    sentiment: detectSentiment(statement),
    statement,
    evidenceIds: [evidenceId],
    confidence: "medium" as ConfidenceLevel,
    inferred: false,
    sourceType,
  }));
}

function scoreFromObservations(observations: Observation[]): StructuredReport["scores"] {
  const base = { transport: 60, school: 60, livability: 60, condition: 60, future_value: 60 };
  for (const o of observations) {
    const delta = o.sentiment === "positive" ? 8 : o.sentiment === "negative" ? -10 : 0;
    if (o.factor === "transport") base.transport += delta;
    else if (o.factor === "school") base.school += delta;
    else if (o.factor === "future_value") base.future_value += delta;
    else if (o.factor === "condition") base.condition += delta;
    else base.livability += delta;
  }
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const scores = {
    transport: clamp(base.transport),
    school: clamp(base.school),
    livability: clamp(base.livability),
    condition: clamp(base.condition),
    future_value: clamp(base.future_value),
    overall: 0,
  };
  scores.overall = clamp(
    (scores.transport + scores.school + scores.livability + scores.condition + scores.future_value) / 5,
  );
  return scores;
}

export async function buildStructuredReport(input: {
  session: InspectionSession;
  media: SessionMedia[];
  publicDataSummary?: string;
}): Promise<StructuredReport> {
  const evidence: Evidence[] = [];
  const observations: Observation[] = [];

  const capture = input.session.capture;
  const voiceText = String(capture.voiceText ?? capture.memoLine ?? capture.memo ?? "");
  const checklist = (capture.checklist as string[]) ?? [];
  const chips = (capture.chips as string[]) ?? [];

  if (voiceText) {
    const eid = uid("ev");
    evidence.push({ id: eid, sourceType: "user_audio", label: "음성 메모", excerpt: voiceText.slice(0, 200) });
    observations.push(...extractObservationsFromText(voiceText, eid, "user_audio"));
  }

  if (checklist.length > 0) {
    const eid = uid("ev");
    evidence.push({
      id: eid,
      sourceType: "checklist",
      label: "체크리스트",
      excerpt: checklist.join(", "),
    });
    for (const c of checklist) {
      observations.push({
        id: uid("obs"),
        factor: detectFactor(c),
        sentiment: detectSentiment(c),
        statement: c,
        evidenceIds: [eid],
        confidence: "high",
        inferred: false,
        sourceType: "checklist",
      });
    }
  }

  for (const chip of chips) {
    const eid = uid("ev");
    evidence.push({ id: eid, sourceType: "user_text", label: "빠른 태그", excerpt: chip });
    observations.push(...extractObservationsFromText(chip, eid, "user_text"));
  }

  for (const m of input.media) {
    if (m.mediaType === "photo" && m.imageTags) {
      const tags = m.imageTags as { tags?: string[]; caption_ko?: string };
      const eid = uid("ev");
      evidence.push({
        id: eid,
        sourceType: "user_photo",
        label: "사진",
        excerpt: tags.caption_ko ?? tags.tags?.join(", "),
        mediaId: m.id,
      });
      for (const tag of tags.tags ?? []) {
        observations.push({
          id: uid("obs"),
          factor: detectFactor(tag),
          sentiment: detectSentiment(tag),
          statement: tag,
          evidenceIds: [eid],
          confidence: "medium",
          inferred: true,
          sourceType: "user_photo",
        });
      }
    }
    if (m.mediaType === "audio" && m.transcript) {
      const tr = m.transcript as { text?: string };
      if (tr.text) {
        const eid = uid("ev");
        evidence.push({ id: eid, sourceType: "user_audio", label: "음성 전사", excerpt: tr.text.slice(0, 200), mediaId: m.id });
        observations.push(...extractObservationsFromText(tr.text, eid, "user_audio"));
      }
    }
  }

  if (input.publicDataSummary) {
    evidence.push({
      id: uid("ev"),
      sourceType: "public_data",
      label: "공공데이터",
      excerpt: input.publicDataSummary.slice(0, 300),
    });
  }

  const scores = scoreFromObservations(observations);
  let strengths = observations.filter((o) => o.sentiment === "positive").map((o) => o.statement).slice(0, 5);
  let weaknesses = observations.filter((o) => o.sentiment === "negative").map((o) => o.statement).slice(0, 5);
  const unknowns: string[] = [];
  if (!observations.some((o) => o.factor === "parking")) unknowns.push("주차 여건 직접 확인 필요");
  if (!observations.some((o) => o.factor === "condition")) unknowns.push("공용부·외벽 상태 추가 사진 권장");
  if (input.publicDataSummary?.includes("정비사업")) {
    unknowns.push("정비사업 공식 단계·고시 문서 확인 필요");
  }

  let topSummary = `${input.session.region}${input.session.aptName ? ` ${input.session.aptName}` : ""} 임장 기록을 바탕으로 ${observations.length}건의 관찰을 정리했습니다.`;
  let followUpQuestions = [
    "야간 소음·주차 상황을 확인했나요?",
    "실거래가와 호가 괴리를 비교했나요?",
  ];
  let llmScores = scores;
  let redevelopment = undefined as StructuredReport["redevelopment"];
  let modelVersion = "rule-based-v2";

  const lens = lensFromSession(input.session);
  const modelOption = getModelOption(defaultModelIdFromEnv());

  if (modelOption?.vendor === "openai" && observations.length > 0) {
    const systemPrompt =
      lens === "redevelopment"
        ? `당신은 한국 도시정비사업 분석 보조 모델이다. 관찰 사실과 해석을 분리하고, 불명확한 정보는 uncertainties에 넣어라. redevelopment 객체를 반드시 채워라. 투자 확정 표현 금지.`
        : `당신은 한국 부동산 임장노트 분석가다. 관찰 사실과 해석을 분리하고, 점수는 근거 없이 높이지 말라. 투자·법률 자문 금지.`;

    const schemaSpec =
      lens === "redevelopment"
        ? FIELD_NOTE_ANALYSIS_SCHEMA
        : {
            ...FIELD_NOTE_ANALYSIS_SCHEMA,
            schema: {
              ...(FIELD_NOTE_ANALYSIS_SCHEMA.schema as Record<string, unknown>),
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

    try {
      const llm = await callOpenAiJsonSchema<{
        topSummary: string;
        strengths: string[];
        weaknesses: string[];
        mustVerify: string[];
        followUpQuestions: string[];
        scores: {
          transport: number;
          school: number;
          livability: number;
          condition: number;
          future_value: number;
        };
        redevelopment?: StructuredReport["redevelopment"];
      }>({
        model: modelOption.apiModel,
        system: systemPrompt,
        user: JSON.stringify({
          region: input.session.region,
          aptName: input.session.aptName,
          lens,
          observations: observations.slice(0, 12),
          publicDataSummary: input.publicDataSummary ?? "",
        }),
        spec: schemaSpec,
      });

      if (llm.ok) {
        topSummary = llm.data.topSummary;
        if (llm.data.followUpQuestions?.length) followUpQuestions = llm.data.followUpQuestions;
        if (llm.data.strengths?.length) strengths = llm.data.strengths.slice(0, 5);
        if (llm.data.weaknesses?.length) weaknesses = llm.data.weaknesses.slice(0, 5);
        if (llm.data.mustVerify?.length) unknowns.push(...llm.data.mustVerify);
        const s = llm.data.scores;
        const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
        llmScores = {
          transport: clamp(s.transport),
          school: clamp(s.school),
          livability: clamp(s.livability),
          condition: clamp(s.condition),
          future_value: clamp(s.future_value),
          overall: 0,
        };
        llmScores.overall = clamp(
          (llmScores.transport +
            llmScores.school +
            llmScores.livability +
            llmScores.condition +
            llmScores.future_value) /
            5,
        );
        if (llm.data.redevelopment) redevelopment = llm.data.redevelopment;
        modelVersion = `${modelOption.id}-structured-v1`;
      }
    } catch {
      // rule-based fallback
    }
  }

  return {
    version: 1,
    topSummary,
    strengths,
    weaknesses,
    unknowns,
    observations,
    evidence,
    scores: llmScores,
    scoreExplanations: [
      { factor: "transport", text: `교통 관련 관찰 ${observations.filter((o) => o.factor === "transport").length}건`, confidence: "medium" },
      { factor: "overall", text: `종합 ${llmScores.overall}점 — 현장 기록 기반`, confidence: observations.length >= 3 ? "medium" : "low" },
    ],
    mustVerify: unknowns,
    followUpQuestions,
    disclaimer: "본 보고서는 AI가 현장 기록을 정리한 참고 자료이며, 투자·법률 자문이 아닙니다.",
    notFinancialAdvice: true,
    generatedAt: new Date().toISOString(),
    modelVersion,
    redevelopment,
  };
}
