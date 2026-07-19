import type { StructuredReport } from "@/lib/inspection/ontology";
import type { InspectionSession } from "@/lib/inspection/session-store";
import { buildStructuredReport } from "@/lib/inspection/structured-report";

/** 무료 AI(규칙 기반) 분석 입력 — OpenAI 키 없이 동작 */
export type FreeInspectionDraft = {
  propertyName?: string;
  address?: string;
  region?: string;
  visitDate?: string;
  quickNote?: string;
  detailedNote?: string;
  voiceTranscript?: string;
  checklist?: string[];
  tags?: string[];
  intent?: string;
};

export function draftToMockSession(
  draft: FreeInspectionDraft,
  authorEmail: string,
): InspectionSession {
  const now = new Date().toISOString();
  const region = draft.region?.trim() || draft.address?.trim() || "미지정";
  const combined = [draft.quickNote, draft.detailedNote, draft.voiceTranscript]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join("\n");

  return {
    id: "free-draft",
    authorEmail,
    region,
    aptName: draft.propertyName?.trim() || null,
    mode: "field_note",
    status: "active",
    privacyClass: "private",
    startedAt: now,
    capture: {
      voiceText: combined,
      memoLine: draft.quickNote?.trim() ?? "",
      memo: draft.detailedNote?.trim() ?? "",
      checklist: draft.checklist ?? [],
      chips: draft.tags ?? [],
      visitDate: draft.visitDate ?? "",
    },
    reportVersion: 0,
    metadata: { intent: draft.intent ?? "실거주", engine: "free-rule-v1" },
    createdAt: now,
    updatedAt: now,
  };
}

export function isFreeAiReport(report: StructuredReport | null | undefined): boolean {
  const v = report?.modelVersion ?? "";
  return v.includes("free") || v.includes("rule-based");
}

/** OpenAI 없이 규칙·키워드 기반 StructuredReport 생성 */
export async function buildFreeInspectionReport(
  draft: FreeInspectionDraft,
  authorEmail: string,
): Promise<StructuredReport> {
  const session = draftToMockSession(draft, authorEmail);
  const report = await buildStructuredReport({
    session,
    media: [],
    publicDataSummary: "",
  });

  return {
    ...report,
    modelVersion: "free-rule-v1",
    disclaimer:
      "무료 AI 요약은 입력 메모·체크리스트를 바탕으로 한 규칙 기반 참고용 리포트입니다. 투자·법률 자문이 아닙니다. OPENAI_API_KEY 연결 후 Pro AI 분석을 사용할 수 있습니다.",
  };
}
