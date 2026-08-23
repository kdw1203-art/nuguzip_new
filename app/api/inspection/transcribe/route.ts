import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { transcribeAudioBlob, transcribeAudioUrl } from "@/lib/ai/transcribe";

/** POST /api/inspection/transcribe — 현장 음성 → OpenAI STT
 *  [AI-37] JSON {url} 모드 추가 — 이미 업로드된 노트 음성 메모(스토리지 URL)를
 *  파일 재업로드 없이 전사한다. 우리 스토리지 경로(notes-voice)만 허용. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const allowed =
      /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/.+notes-voice/.test(url);
    if (!url || !allowed) {
      return NextResponse.json({ error: "허용되지 않은 오디오 URL입니다." }, { status: 400 });
    }
    const { text, source } = await transcribeAudioUrl(url, { language: "ko" });
    if (!text) {
      return NextResponse.json({ error: "transcription_failed", source }, { status: 502 });
    }
    return NextResponse.json({ text, source });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }

  const clientText = String(form.get("clientText") ?? "").trim();
  const name = file instanceof File ? file.name : "audio.webm";
  const { text, source } = await transcribeAudioBlob(file, name, {
    language: "ko",
    clientText: clientText || undefined,
  });

  if (!text) {
    return NextResponse.json({ error: "transcription_failed", source }, { status: 502 });
  }

  return NextResponse.json({ text, source });
}
