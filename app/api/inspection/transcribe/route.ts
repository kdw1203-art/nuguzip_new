import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { transcribeAudioBlob } from "@/lib/ai/transcribe";

/** POST /api/inspection/transcribe — 현장 음성 → OpenAI STT */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
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
