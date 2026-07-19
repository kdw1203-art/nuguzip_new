import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isOpenAiConfigured } from "@/lib/ai/env-keys";
import {
  buildFreeInspectionReport,
  type FreeInspectionDraft,
} from "@/lib/inspection/free-inspection-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeDraft(body: Record<string, unknown>): FreeInspectionDraft {
  const note =
    body.note && typeof body.note === "object"
      ? (body.note as Record<string, unknown>)
      : body;

  return {
    propertyName: String(note.propertyName ?? note.title ?? note.aptName ?? "").trim(),
    address: String(note.address ?? "").trim(),
    region: String(note.region ?? "").trim(),
    visitDate: String(note.visitDate ?? "").trim(),
    quickNote: String(note.quickNote ?? note.summary ?? "").trim(),
    detailedNote: String(note.detailedNote ?? note.memo ?? "").trim(),
    voiceTranscript: String(note.voiceTranscript ?? "").trim(),
    checklist: Array.isArray(note.checklist) ? note.checklist.map(String) : [],
    tags: Array.isArray(note.tags) ? note.tags.map(String) : [],
    intent: String(note.intent ?? "실거주").trim(),
  };
}

function hasContent(draft: FreeInspectionDraft): boolean {
  return Boolean(
    draft.propertyName ||
      draft.quickNote ||
      draft.detailedNote ||
      draft.voiceTranscript ||
      (draft.checklist?.length ?? 0) > 0,
  );
}

/**
 * POST /api/inspection/analyze-free
 * OpenAI 키 없이 규칙 기반 임장 리포트 (무료). 월 quota 미차감.
 * Pro AI는 `OPENAI_API_KEY` 설정 후 `/api/inspection/jobs` report 등 기존 경로 사용.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const draft = normalizeDraft(body);

  if (!hasContent(draft)) {
    return NextResponse.json(
      { error: "단지명 또는 메모를 한두 줄 이상 입력해 주세요." },
      { status: 400 },
    );
  }

  const report = await buildFreeInspectionReport(draft, session.user.email);

  return NextResponse.json({
    success: true,
    engine: "free-rule-v1",
    premiumAvailable: isOpenAiConfigured(),
    report,
  });
}
