import { getOpenAiApiKey } from "@/lib/ai/env-keys";
import { isAllowedSupabaseUrl } from "@/lib/storage/assert-supabase-url";

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
  /* 사용자가 준 URL 을 서버가 그대로 가져가면 SSRF 다. 예전 검사는
     `startsWith("http")` 뿐이라 http://169.254.169.254/latest/meta-data/ (클라우드
     인스턴스 메타데이터)·127.0.0.1·사설망이 전부 통과했고, 본문 일부가 transcript
     로 돌아왔다. 우리가 실제로 읽어야 하는 것은 우리 Supabase 스토리지 파일
     하나뿐이므로, 그 오리진만 허용한다. */
  if (!isAllowedSupabaseUrl(url)) return { text: "", source: "invalid_url" };
  try {
    const audioRes = await fetch(url);
    if (!audioRes.ok) return { text: "", source: "fetch_failed" };
    const blob = await audioRes.blob();
    return transcribeAudioBlob(blob, "audio.webm", opts);
  } catch {
    return { text: "", source: "fetch_exception" };
  }
}
