import { getOpenAiApiKey } from "@/lib/ai/env-keys";
import type { StructuredReport } from "@/lib/inspection/ontology";

const TTS_MODEL = process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.OPENAI_TTS_VOICE?.trim() || "nova";

export function buildBriefingScript(propertyLabel: string, report: StructuredReport): string {
  const pros = report.strengths.slice(0, 2).join(", ") || "특별한 장점은 추가 확인이 필요합니다";
  const cons = report.weaknesses.slice(0, 2).join(", ") || "뚜렷한 리스크는 아직 없습니다";
  return [
    `${propertyLabel} 임장 브리핑입니다.`,
    report.topSummary,
    `종합 점수는 ${report.scores.overall}점입니다.`,
    `장점은 ${pros}.`,
    `주의할 점은 ${cons}.`,
    "투자·법률 자문이 아닌 참고용 정보입니다.",
  ].join(" ");
}

/** OpenAI TTS — MP3 ArrayBuffer 반환 */
export async function synthesizeBriefingMp3(script: string): Promise<ArrayBuffer | null> {
  const key = getOpenAiApiKey();
  if (!key || !script.trim()) return null;

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: script.slice(0, 4096),
      response_format: "mp3",
    }),
  });

  if (!res.ok) return null;
  return res.arrayBuffer();
}
