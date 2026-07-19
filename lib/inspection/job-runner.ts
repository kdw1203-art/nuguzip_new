import { transcribeAudioUrl } from "@/lib/ai/transcribe";
import {
  getSession,
  listSessionMedia,
  updateSession,
  updateSessionMedia,
  updateJob,
  type AiJob,
} from "@/lib/inspection/session-store";
import { buildStructuredReport } from "@/lib/inspection/structured-report";
import { buildScenarios } from "@/lib/inspection/compare-scenario";
import { incrementReportUsage } from "@/lib/inspection/quota";
import { syncSessionToInspectionNote } from "@/lib/inspection/session-note-bridge";
import { fetchSessionPublicSummary } from "@/lib/inspection/session-public-context";

const PHOTO_TAG_RULES: Array<[string, RegExp]> = [
  ["주차장", /주차|parking/i],
  ["외벽", /외벽|facade|building/i],
  ["로비", /로비|lobby/i],
  ["상가", /상가|store|shop/i],
  ["조망", /view|조망|sky/i],
];

function tagPhotoFromHint(hint?: string, fileName?: string): {
  scene_type: string;
  tags: string[];
  caption_ko: string;
  confidence: string;
} {
  const src = `${hint ?? ""} ${fileName ?? ""}`;
  const tags: string[] = [];
  let scene = "general";
  for (const [tag, re] of PHOTO_TAG_RULES) {
    if (re.test(src)) {
      tags.push(tag);
      scene = tag;
    }
  }
  if (tags.length === 0) tags.push("현장", "단지");
  return {
    scene_type: scene,
    tags,
    caption_ko: `현장 사진 — ${tags.join(", ")}`,
    confidence: "medium",
  };
}

async function transcribeAudio(url: string, clientText?: string): Promise<{ text: string; source: string }> {
  return transcribeAudioUrl(url, { language: "ko", clientText });
}

export async function processInspectionJob(job: AiJob): Promise<AiJob> {
  await updateJob(job.id, { status: "processing" });
  const sessionId = job.sessionId;
  if (!sessionId) {
    return (await updateJob(job.id, {
      status: "failed",
      error: "session_id required",
      completedAt: new Date().toISOString(),
    }))!;
  }

  const session = await getSession(sessionId);
  if (!session) {
    return (await updateJob(job.id, {
      status: "failed",
      error: "session not found",
      completedAt: new Date().toISOString(),
    }))!;
  }

  try {
    const media = await listSessionMedia(sessionId);

    if (job.jobType === "stt") {
      const audio = media.find((m) => m.mediaType === "audio");
      const clientText = String(job.input.clientText ?? session.capture.voiceText ?? "");
      const { text, source } = audio?.publicUrl
        ? await transcribeAudio(audio.publicUrl, clientText)
        : { text: clientText, source: "capture" };
      if (audio) {
        await updateSessionMedia(audio.id, {
          transcript: { text, source, at: new Date().toISOString() },
          uploadStatus: "ready",
        });
      }
      const capture = { ...session.capture, voiceText: text || clientText };
      await updateSession(sessionId, { capture });
      return (await updateJob(job.id, {
        status: "ready",
        output: { text, source },
        modelVersion: source,
        completedAt: new Date().toISOString(),
      }))!;
    }

    if (job.jobType === "vision") {
      const results: Record<string, unknown>[] = [];
      for (const photo of media.filter((m) => m.mediaType === "photo")) {
        const hint = String(job.input.hint ?? photo.exif?.hint ?? "");
        const tags = tagPhotoFromHint(hint, photo.storagePath ?? undefined);
        await updateSessionMedia(photo.id, { imageTags: tags, uploadStatus: "ready" });
        results.push({ mediaId: photo.id, ...tags });
      }
      return (await updateJob(job.id, {
        status: "ready",
        output: { photos: results },
        modelVersion: "vision-rules-v1",
        completedAt: new Date().toISOString(),
      }))!;
    }

    if (job.jobType === "report") {
      const refreshedMedia = await listSessionMedia(sessionId);
      const pub = await fetchSessionPublicSummary(session);
      const publicDataSummary =
        String(job.input.publicDataSummary ?? "") || pub.summary;
      const report = await buildStructuredReport({
        session,
        media: refreshedMedia,
        publicDataSummary,
      });
      await updateSession(sessionId, {
        structuredReport: report,
        reportVersion: session.reportVersion + 1,
        status: "ready",
        metadata: {
          ...session.metadata,
          publicDataHints: pub.checklistHints,
          redevelopmentContext: pub.redevelopmentBlock ?? null,
        },
      });
      await incrementReportUsage(job.authorEmail);
      const linked = await syncSessionToInspectionNote(sessionId);
      return (await updateJob(job.id, {
        status: "ready",
        output: { report, noteId: linked?.noteId ?? null },
        modelVersion: report.modelVersion ?? "rule-based-v2",
        completedAt: new Date().toISOString(),
      }))!;
    }

    if (job.jobType === "scenario") {
      const report = session.structuredReport;
      const scenarios = buildScenarios({
        currentPriceManwon: Number(job.input.currentPriceManwon ?? 0) || undefined,
        overallScore: report?.scores.overall ?? 60,
        weaknesses: report?.weaknesses ?? [],
        holdingYears: Number(job.input.holdingYears ?? 3),
      });
      return (await updateJob(job.id, {
        status: "ready",
        output: { scenarios },
        modelVersion: "scenario-v1",
        completedAt: new Date().toISOString(),
      }))!;
    }

    return (await updateJob(job.id, {
      status: "failed",
      error: "unknown job type",
      completedAt: new Date().toISOString(),
    }))!;
  } catch (e) {
    return (await updateJob(job.id, {
      status: "failed",
      error: e instanceof Error ? e.message : "job failed",
      completedAt: new Date().toISOString(),
    }))!;
  }
}
