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

/**
 * AI 작업 실행기.
 *
 * session-store 의 함수들은 이제 조회·갱신에 실패하면 던진다. 여기서 그 예외를
 * 그냥 흘려보내면 작업 행이 `processing` 인 채로 남고, 폴링하는 화면은 영영
 * "처리 중"이 된다 — 끝나지 않는 진행 표시는 실패보다 나쁘다. 그래서 아래
 * catch 에서 작업을 `failed` 로 닫아 사용자가 다시 시도할 수 있게 한다.
 * 닫는 것마저 실패하면 원래 오류를 그대로 올려, 부르는 라우트가 503 으로
 * 답하게 한다(성공했다고 답하지는 않는다).
 */
export async function processInspectionJob(job: AiJob): Promise<AiJob> {
  const sessionId = job.sessionId;

  try {
    await updateJob(job.id, { status: "processing" });
    if (!sessionId) {
      return (await updateJob(job.id, {
        status: "failed",
        error: "session_id required",
        completedAt: new Date().toISOString(),
      }))!;
    }

    /* 조회 실패와 "세션 없음"은 다르다. 없으면 null 이라 아래에서 failed 로 닫고,
       못 읽었으면 던져서 catch 로 간다. */
    const session = await getSession(sessionId);
    if (!session) {
      return (await updateJob(job.id, {
        status: "failed",
        error: "session not found",
        completedAt: new Date().toISOString(),
      }))!;
    }

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
      const overall = report?.scores?.overall;
      if (overall == null || !Number.isFinite(Number(overall))) {
        return (await updateJob(job.id, {
          status: "failed",
          error: "insufficient_data: structured report overall score missing",
          completedAt: new Date().toISOString(),
        }))!;
      }
      const scenarios = buildScenarios({
        currentPriceManwon: Number(job.input.currentPriceManwon ?? 0) || undefined,
        overallScore: Number(overall),
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
    /* 작업을 닫는 것도 DB 다. 그것마저 안 되면 원래 오류를 올린다 — 여기서
       삼키면 라우트가 "성공"으로 답하고, 작업은 processing 에 갇힌다. */
    try {
      return (await updateJob(job.id, {
        status: "failed",
        error: e instanceof Error ? e.message : "job failed",
        completedAt: new Date().toISOString(),
      }))!;
    } catch {
      throw e;
    }
  }
}
