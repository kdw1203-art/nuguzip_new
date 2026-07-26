import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  computeAiSummary,
  getNote,
  updateNote,
  type InspectionNote,
  type InspectionNoteMetadata,
  type InspectionScores,
  type InspectionSections,
} from "@/lib/inspection/store-db";
import { detectShellFromUserAgent } from "@/lib/platform-shell";
import { appendRun, objectiveHash } from "@/lib/ai/presets-store";
import {
  checkAiAnalysisQuota,
  quotaDeniedJson,
  resolveQuotaPlan,
} from "@/lib/subscriptions/usage-summary";
import { logger } from "@/lib/log";
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
import {
  AI_DISCLAIMER,
  describeSnapshot,
  marketBulletsFromSnapshot,
  resolveRegionSnapshotByName,
} from "@/lib/ai/market-insight";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** 임장노트 metadata 확장 필드 — AI 재분석 캐시·직전 결과 1개 보관 */
type InspectionAiCacheMeta = InspectionNoteMetadata & {
  /** 마지막 분석 시점의 노트 내용 해시 (내용 미변경 시 캐시 반환) */
  aiContentHash?: string;
  /** 덮어쓰기 직전 분석 결과 1개 보관 */
  previousAiAnalysis?: Record<string, unknown> | null;
};

/** 노트 내용 기반 해시 — 내용이 그대로면 재분석 대신 기존 결과를 반환한다. */
function noteContentHash(note: InspectionNote, intent: InspectionAiIntent): string {
  return objectiveHash({
    intent,
    title: note.title,
    region: note.region,
    visitDate: (note as { visitDate?: unknown }).visitDate ?? null,
    scores: note.scores,
    sections: note.sections,
    checklist: note.checklist,
    photos: note.photos,
  });
}

function reportRunMarkdown(report: {
  headline: string;
  verdict: string;
  strengths: string[];
  risks: string[];
  followUps: string[];
}): string {
  return [
    `## ${report.headline}`,
    report.verdict,
    "",
    ...report.strengths.map((s) => `- 강점: ${s}`),
    ...report.risks.map((s) => `- 리스크: ${s}`),
    ...report.followUps.map((s) => `- 확인: ${s}`),
  ].join("\n");
}

/**
 * AI 임장 분석 엔드포인트.
 * - noteId가 있으면 저장된 임장노트 기준으로 구조화 리포트를 생성하고 ai_analysis에 저장
 *   (노트 내용 미변경 시 캐시 반환 — body.force=true 또는 ?force=1 로 강제 재분석)
 * - noteId가 없으면 기존 점수/섹션 기반 분석으로 동작
 * - 성공 시 ai_analysis_runs 에 기록해 월 사용량(무료 3회/월)을 실제로 집계·강제한다.
 */
import { dbUnavailable } from "@/lib/api/db-unavailable";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const email = session.user.email.trim().toLowerCase();
  const sessionPlan = (session.user as { plan?: string }).plan ?? null;
  // AI 실행 사용량 제한: 10회/시간/IP
  const rl = rateLimit(`ai-exec:${getClientIp(req)}`, {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const requestedModelId =
    typeof body.modelId === "string" ? body.modelId.trim() : "";
  const modelId = requestedModelId || defaultModelIdFromEnv();
  const noteId = typeof body.noteId === "string" ? body.noteId.trim() : "";
  const modelOption =
    getModelOption(modelId) ?? getModelOption(LLM_MODEL_OPTIONS[0]?.id);

  if (noteId) {
    /* "찾을 수 없습니다"는 없다는 뜻이다. 못 읽은 것에 그 문장을 쓰면
       사용자는 노트가 삭제된 줄 안다. */
    let note: Awaited<ReturnType<typeof getNote>>;
    try {
      note = await getNote(noteId);
    } catch (e) {
      return dbUnavailable("inspection-ai-note", e);
    }
    if (!note) {
      return NextResponse.json({ error: "임장노트를 찾을 수 없습니다." }, { status: 404 });
    }
    if (note.authorEmail.toLowerCase() !== session.user.email.trim().toLowerCase()) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const intent = normalizeIntent(body.intent, note.metadata?.intent);
    const meta = (note.metadata ?? {}) as InspectionAiCacheMeta;
    const contentHash = noteContentHash(note, intent);
    const force =
      body.force === true ||
      body.force === "1" ||
      new URL(req.url).searchParams.get("force") === "1";

    // 노트 내용이 변하지 않았으면 저장된 분석을 그대로 반환 (사용량 미차감)
    if (!force && note.aiAnalysis && meta.aiContentHash === contentHash && meta.inspectionReport) {
      const cachedReport = meta.inspectionReport as { source?: string };
      return NextResponse.json({
        analysis: note.aiAnalysis,
        report: meta.inspectionReport,
        cached: true,
        mode: cachedReport.source === "fallback" ? "rule" : "llm",
        marketContext: null,
        disclaimer: AI_DISCLAIMER,
      });
    }

    // 월 사용량 한도(무료 3회/월) — 새 분석을 만들기 전에 강제
    const plan = await resolveQuotaPlan(email, sessionPlan);
    let quota: Awaited<ReturnType<typeof checkAiAnalysisQuota>>;
    try {
      quota = await checkAiAnalysisQuota(email, plan);
    } catch (e) {
      return dbUnavailable("inspection-ai-quota", e);
    }
    if (!quota.allowed) {
      return NextResponse.json(
        quotaDeniedJson(quota.message, quota.requiredTier, quota.used, quota.limit),
        { status: 403 },
      );
    }

    const baseAnalysis = computeAiSummary({
      scores: note.scores,
      sections: note.sections,
      region: note.region,
      investorRole: normalizeInvestorRole(body.investorRole),
      holdingYears: normalizeNumber(body.holdingYears, 5),
      riskTolerance: normalizeNumber(body.riskTolerance, 3),
    });

    // 지역 실시세 스냅샷(읽기 전용) — 실패 시 null로 안전 강등
    const marketSnapshot = await resolveRegionSnapshotByName(note.region);

    let report = buildFallbackInspectionAiReport(note, { intent });
    if (modelOption) {
      try {
        const promptInput = buildInspectionAiPromptInput(note, { intent });
        const llm = await callLlmChat(modelOption, [
          {
            role: "system",
            content: [
              "당신은 nuguzip.com의 한국어 임장노트 분석 보조 AI입니다.",
              "제공되는 marketSnapshot(지역 실시세: 평균 매매가·전월 대비 변동률·전세가율)이 있으면 강점/리스크/확인 항목·총평에 반드시 반영하세요.",
              inspectionAiReportJsonInstruction(),
            ].join("\n\n"),
          },
          {
            role: "user",
            content: JSON.stringify(
              { ...promptInput, marketSnapshot: marketSnapshot ?? undefined },
              null,
              2,
            ),
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

    // 규칙 기반(폴백) 결과에는 실시세 델타 규칙 불릿을 병합 (LLM 결과는 프롬프트에서 반영)
    if (marketSnapshot && report.source === "fallback") {
      const bullets = marketBulletsFromSnapshot(marketSnapshot);
      report = {
        ...report,
        strengths: [...new Set([...report.strengths, ...bullets.strengths])].slice(0, 6),
        risks: [...new Set([...report.risks, ...bullets.risks])].slice(0, 6),
        followUps: [...new Set([...report.followUps, ...bullets.followUps])].slice(0, 6),
      };
    }

    const analysis = mergeInspectionReportIntoAnalysis(baseAnalysis, report);

    // 사용량 계측 — /my "AI 분석 월 사용량" 카운터가 실제로 오르도록 기록
    try {
      const score = (analysis as { score?: unknown }).score;
      await appendRun({
        authorEmail: email,
        tool: "ai-inspection",
        inputSnapshot: { noteId: note.id, region: note.region, intent },
        modelId: (analysis as { modelId?: string | null }).modelId ?? null,
        source: report.source === "fallback" ? "internal" : report.source,
        platform: detectShellFromUserAgent(req.headers.get("user-agent")),
        structuredSummary: {
          headline: report.headline,
          bullets: [...report.strengths, ...report.risks].slice(0, 5),
          score: typeof score === "number" && Number.isFinite(score) ? Math.round(score) : null,
          tags: [note.region, intent].filter(Boolean),
        },
        markdown: reportRunMarkdown(report),
      });
    } catch (e) {
      // 기록 실패가 분석 결과 자체를 막지는 않는다 (best-effort 계측)
      logger.error("[inspection/ai] run append failed", e);
    }

    if (body.persistAnalysis !== false) {
      const nextMeta: InspectionAiCacheMeta = {
        ...meta,
        intent,
        inspectionReport: report as unknown as Record<string, unknown>,
        inspectionReportGeneratedAt: report.generatedAt,
        aiContentHash: contentHash,
        // 덮어쓰기 직전 결과 1개 보관
        previousAiAnalysis: note.aiAnalysis
          ? {
              analysis: note.aiAnalysis,
              report: meta.inspectionReport ?? null,
              savedAt: new Date().toISOString(),
            }
          : (meta.previousAiAnalysis ?? null),
      };
      await updateNote(note.id, {
        aiAnalysis: analysis,
        metadata: nextMeta as InspectionNoteMetadata,
      });
    }

    return NextResponse.json({
      analysis,
      report,
      cached: false,
      // "AI 생성" vs "규칙 기반 요약" 라벨용 — fallback 이 아니면 LLM 생성
      mode: report.source === "fallback" ? "rule" : "llm",
      marketContext: marketSnapshot
        ? { snapshot: marketSnapshot, summary: describeSnapshot(marketSnapshot) }
        : null,
      usage: { used: quota.used + 1, limit: quota.limit },
      disclaimer: AI_DISCLAIMER,
    });
  }

  // noteId 없는 경로도 동일하게 월 사용량 한도를 강제
  const freePlan = await resolveQuotaPlan(email, sessionPlan);
  let freeQuota: Awaited<ReturnType<typeof checkAiAnalysisQuota>>;
  try {
    freeQuota = await checkAiAnalysisQuota(email, freePlan);
  } catch (e) {
    return dbUnavailable("inspection-ai-quota", e);
  }
  if (!freeQuota.allowed) {
    return NextResponse.json(
      quotaDeniedJson(freeQuota.message, freeQuota.requiredTier, freeQuota.used, freeQuota.limit),
      { status: 403 },
    );
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

  const engine = String((analysis as Record<string, unknown>).engine ?? "");

  // 사용량 계측 (noteId 없는 경로) — best-effort
  try {
    const summaryText = String(
      (analysis as Record<string, unknown>).llmDetailedConclusion ??
        (analysis as Record<string, unknown>).summary ??
        "임장 분석 실행",
    );
    await appendRun({
      authorEmail: email,
      tool: "ai-inspection",
      inputSnapshot: { region: String(body.region ?? ""), scores },
      modelId: (analysis as { modelId?: string | null }).modelId ?? null,
      source: String((analysis as Record<string, unknown>).source ?? "internal"),
      platform: detectShellFromUserAgent(req.headers.get("user-agent")),
      structuredSummary: null,
      markdown: summaryText.slice(0, 4000),
    });
  } catch (e) {
    logger.error("[inspection/ai] run append failed", e);
  }

  return NextResponse.json({
    analysis,
    mode: engine.startsWith("rule-based") || !engine ? "rule" : "llm",
    usage: { used: freeQuota.used + 1, limit: freeQuota.limit },
    disclaimer: AI_DISCLAIMER,
  });
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
