import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  computeAiSummary,
  getNote,
  updateNote,
  type InspectionScores,
  type InspectionSections,
} from "@/lib/inspection/store-db";
import { callLlmChat } from "@/lib/ai/llm-provider";
import {
  LLM_MODEL_OPTIONS,
  defaultModelIdFromEnv,
  getModelOption,
} from "@/lib/ai/llm-models";
import {
  buildFallbackInspectionAiReport,
  buildInspectionAiPromptInput,
  inspectionAiReportJsonInstruction,
  mergeInspectionReportIntoAnalysis,
  parseInspectionAiReport,
  type InspectionAiIntent,
} from "@/lib/inspection/ai-report";

/**
 * AI 임장 분석 엔드포인트.
 * - noteId가 있으면 저장된 임장노트 기준으로 구조화 리포트를 생성하고 ai_analysis에 저장
 * - noteId가 없으면 기존 점수/섹션 기반 분석으로 동작
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const requestedModelId =
    typeof body.modelId === "string" ? body.modelId.trim() : "";
  const modelId = requestedModelId || defaultModelIdFromEnv();
  const noteId = typeof body.noteId === "string" ? body.noteId.trim() : "";
  const modelOption =
    getModelOption(modelId) ?? getModelOption(LLM_MODEL_OPTIONS[0]?.id);

  if (noteId) {
    const note = await getNote(noteId);
    if (!note) {
      return NextResponse.json({ error: "임장노트를 찾을 수 없습니다." }, { status: 404 });
    }
    if (note.authorEmail.toLowerCase() !== session.user.email.trim().toLowerCase()) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const intent = normalizeIntent(body.intent, note.metadata?.intent);
    const baseAnalysis = computeAiSummary({
      scores: note.scores,
      sections: note.sections,
      region: note.region,
      investorRole: normalizeInvestorRole(body.investorRole),
      holdingYears: normalizeNumber(body.holdingYears, 5),
      riskTolerance: normalizeNumber(body.riskTolerance, 3),
    });

    let report = buildFallbackInspectionAiReport(note, { intent });
    if (modelOption) {
      try {
        const promptInput = buildInspectionAiPromptInput(note, { intent });
        const llm = await callLlmChat(modelOption, [
          {
            role: "system",
            content: [
              "당신은 nuguzip.com의 한국어 임장노트 분석 보조 AI입니다.",
              inspectionAiReportJsonInstruction(),
            ].join("\n\n"),
          },
          {
            role: "user",
            content: JSON.stringify(promptInput, null, 2),
          },
        ]);
        if (llm.ok) {
          report = parseInspectionAiReport(llm.text, note, {
            intent,
            source: llm.vendor,
          });
          baseAnalysis.engine = `${llm.vendor}:${llm.apiModel}`;
          baseAnalysis.modelId = modelOption.id;
        } else {
          baseAnalysis.engine = `rule-based-v1 (${modelOption.id} fallback)`;
          baseAnalysis.modelId = modelOption.id;
        }
      } catch {
        baseAnalysis.engine = `rule-based-v1 (${modelOption.id} fallback)`;
        baseAnalysis.modelId = modelOption.id;
      }
    }

    const analysis = mergeInspectionReportIntoAnalysis(baseAnalysis, report);
    if (body.persistAnalysis !== false) {
      await updateNote(note.id, {
        aiAnalysis: analysis,
        metadata: {
          ...note.metadata,
          intent,
          inspectionReport: report,
          inspectionReportGeneratedAt: report.generatedAt,
        },
      });
    }

    return NextResponse.json({ analysis, report });
  }

  const scores = scoresFrom(body.scores);
  const sections =
    body.sections && typeof body.sections === "object"
      ? (body.sections as InspectionSections)
      : {};
  const analysis = computeAiSummary({
    scores,
    sections,
    region: String(body.region ?? ""),
    investorRole: normalizeInvestorRole(body.investorRole),
    holdingYears: normalizeNumber(body.holdingYears, 5),
    riskTolerance: normalizeNumber(body.riskTolerance, 3),
  });

  if (modelOption) {
    try {
      const llm = await callLlmChat(modelOption, [
        {
          role: "system",
          content:
            "당신은 한국 부동산 임장 분석 보조 AI입니다. 과장 없이, 실행 가능한 결론을 5~7문장으로 한국어로 작성하세요.",
        },
        {
          role: "user",
          content: [
            "다음 임장 분석 초안 데이터를 바탕으로 '상세 결론'을 작성해 주세요.",
            JSON.stringify(
              {
                region: body.region ?? "",
                scores,
                sections,
                baseAnalysis: analysis,
              },
              null,
              2,
            ),
            "출력은 평문 단락 하나로 작성하세요.",
          ].join("\n\n"),
        },
      ]);
      if (llm.ok) {
        (analysis as Record<string, unknown>).llmDetailedConclusion = llm.text;
        (analysis as Record<string, unknown>).engine = `${llm.vendor}:${llm.apiModel}`;
        (analysis as Record<string, unknown>).modelId = modelOption.id;
        (analysis as Record<string, unknown>).source = llm.vendor;
      } else {
        (analysis as Record<string, unknown>).engine = `rule-based-v1 (${modelOption.id} fallback)`;
        (analysis as Record<string, unknown>).modelId = modelOption.id;
        (analysis as Record<string, unknown>).source = "internal";
      }
    } catch {
      (analysis as Record<string, unknown>).engine = `rule-based-v1 (${modelOption.id} fallback)`;
      (analysis as Record<string, unknown>).modelId = modelOption.id;
      (analysis as Record<string, unknown>).source = "internal";
    }
  }

  return NextResponse.json({ analysis });
}

function scoresFrom(value: unknown): InspectionScores {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    location: normalizeNumber(rec.location, 0),
    school: normalizeNumber(rec.school, 0),
    transport: normalizeNumber(rec.transport, 0),
    facility: normalizeNumber(rec.facility, 0),
    future: normalizeNumber(rec.future, 0),
  };
}

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeInvestorRole(value: unknown) {
  return value === "live" ||
    value === "invest" ||
    value === "flip" ||
    value === "rent" ||
    value === "balanced"
    ? value
    : "balanced";
}

function normalizeIntent(value: unknown, fallback: unknown): InspectionAiIntent {
  if (value === "실거주" || value === "투자" || value === "전월세") return value;
  if (fallback === "실거주" || fallback === "투자" || fallback === "전월세") return fallback;
  return "실거주";
}
