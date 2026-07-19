import type { StructuredReport } from "@/lib/inspection/ontology";
import {
  getSession,
  listSessionMedia,
  updateSession,
  type InspectionSession,
} from "@/lib/inspection/session-store";
import {
  createNote,
  updateNote,
  type InspectionChecklistItem,
  type InspectionScores,
} from "@/lib/inspection/store-db";

function mapScores(report: StructuredReport): InspectionScores {
  const s = report.scores;
  return {
    location: s.livability ?? 0,
    school: s.school ?? 0,
    transport: s.transport ?? 0,
    facility: s.condition ?? 0,
    future: s.future_value ?? 0,
  };
}

function buildNotePayload(
  session: InspectionSession,
  report: StructuredReport,
  photos: string[],
): Parameters<typeof createNote>[0] {
  const chips = Array.isArray(session.capture.chips)
    ? (session.capture.chips as string[])
    : [];
  const checklist: InspectionChecklistItem[] = chips.map((label) => ({
    label: String(label),
    done: true,
  }));

  const title =
    session.aptName?.trim() ||
    `${session.region} 임장 (${session.startedAt.slice(0, 10)})`;

  return {
    authorEmail: session.authorEmail,
    authorLabel: session.authorLabel ?? undefined,
    title,
    region: session.region,
    aptName: session.aptName ?? undefined,
    visitDate: session.startedAt.slice(0, 10),
    summary: report.topSummary,
    scores: mapScores(report),
    checklist,
    sections: {
      pros: report.strengths.join("\n"),
      cons: report.weaknesses.join("\n"),
      memo: String(session.capture.voiceText ?? ""),
    },
    photos,
    aiAnalysis: {
      structuredReport: report,
      sessionId: session.id,
      source: "inspection_session",
    },
    metadata: {
      structuredNote: report as unknown as Record<string, unknown>,
      evidenceRefs: report.evidence.map((e) => ({ ...e })),
      intent:
        session.mode === "investment_note"
          ? "투자"
          : session.mode === "rent_note"
            ? "전월세"
            : "실거주",
    },
    isPublic: false,
  };
}

/** 세션 AI 리포트 → inspection_notes 행 생성·갱신 후 session.note_id 연결 */
export async function syncSessionToInspectionNote(
  sessionId: string,
): Promise<{ noteId: string } | null> {
  const session = await getSession(sessionId);
  if (!session?.structuredReport) return null;

  const media = await listSessionMedia(sessionId);
  const photos = media
    .filter((m) => m.mediaType === "photo" && m.publicUrl)
    .map((m) => m.publicUrl as string);

  const payload = buildNotePayload(session, session.structuredReport, photos);
  const scores = mapScores(session.structuredReport);

  if (session.noteId) {
    await updateNote(session.noteId, {
      title: payload.title,
      region: payload.region,
      aptName: payload.aptName,
      visitDate: payload.visitDate,
      summary: payload.summary,
      scores,
      checklist: payload.checklist,
      sections: payload.sections,
      photos: payload.photos,
      aiAnalysis: payload.aiAnalysis,
      metadata: payload.metadata,
    });
    return { noteId: session.noteId };
  }

  const note = await createNote(payload);
  await updateSession(sessionId, { noteId: note.id });
  return { noteId: note.id };
}
