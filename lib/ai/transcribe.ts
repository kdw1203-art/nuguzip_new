import { getOpenAiApiKey } from "@/lib/ai/env-keys";

export type TranscribeResult = {
  text: string;
  source: string;
};

const STT_MODEL = process.env.OPENAI_STT_MODEL?.trim() || "gpt-4o-mini-transcribe";

/** OpenAI Audio API — gpt-4o-mini-transcribe (폴백: whisper-1) */
export async function transcribeAudioBlob(
  blob: Blob,
  fileName = "audio.webm",
  opts?: { language?: string; clientText?: string },
): Promise<TranscribeResult> {
  if (opts?.clientText?.trim()) {
    return { text: opts.clientText.trim(), source: "client_stt" };
  }

  const key = getOpenAiApiKey();
  if (!key) return { text: "", source: "no_api_key" };

  const models = [STT_MODEL, "whisper-1"];
  for (const model of models) {
    try {
      const form = new FormData();
      form.append("file", blob, fileName);
      form.append("model", model);
      if (opts?.language) form.append("language", opts.language);

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      const data = (await res.json()) as { text?: string; error?: { message?: string } };
      if (res.ok && data.text?.trim()) {
        return { text: data.text.trim(), source: model };
      }
      if (model === models[models.length - 1]) {
        return { text: "", source: data.error?.message ?? `${model}_error` };
      }
    } catch {
      if (model === models[models.length - 1]) {
        return { text: "", source: "transcribe_exception" };
      }
    }
  }
  return { text: "", source: "transcribe_failed" };
}

export async function transcribeAudioUrl(
  url: string,
  opts?: { language?: string; clientText?: string },
): Promise<TranscribeResult> {
  if (opts?.clientText?.trim()) {
    return { text: opts.clientText.trim(), source: "client_stt" };
  }
  if (!url.startsWith("http")) return { text: "", source: "invalid_url" };
  try {
    const audioRes = await fetch(url);
    if (!audioRes.ok) return { text: "", source: "fetch_failed" };
    const blob = await audioRes.blob();
    return transcribeAudioBlob(blob, "audio.webm", opts);
  } catch {
    return { text: "", source: "fetch_exception" };
  }
}
