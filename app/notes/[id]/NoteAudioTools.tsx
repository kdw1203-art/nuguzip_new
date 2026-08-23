"use client";

import { useRef, useState } from "react";

/* [AI-36·37] 노트 오디오 도구 —
   ① 브리핑 듣기: 기존 TTS API(이미 구현돼 있던 미노출 기능)를 노트 상세에 노출.
      이동 중 자기 노트를 귀로 복습하는 사용 맥락. 실패는 배지로 말하고 접힌다.
   ② 음성 메모 전사(작성자만): 현장 녹음을 텍스트로 — 결과는 복사해서 메모에
      붙여넣는다(자동 병합은 수정 이력과 얽혀 후속 판단). */

export function NoteAudioTools({
  voiceMemos,
  isOwner,
  propertyLabel,
  briefingScript,
}: {
  voiceMemos: string[];
  isOwner: boolean;
  propertyLabel: string;
  briefingScript: string;
}) {
  const [ttsState, setTtsState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const playBriefing = async () => {
    if (ttsState === "loading") return;
    if (ttsState === "playing") {
      audioRef.current?.pause();
      setTtsState("idle");
      return;
    }
    setTtsState("loading");
    try {
      const res = await fetch("/api/inspection/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyLabel, script: briefingScript }),
      });
      if (!res.ok) throw new Error("tts");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setTtsState("idle");
      await audio.play();
      setTtsState("playing");
    } catch {
      setTtsState("error");
    }
  };

  const transcribe = async (url: string) => {
    if (busyUrl) return;
    setBusyUrl(url);
    try {
      const res = await fetch("/api/inspection/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json: { text?: string; error?: string } = await res.json().catch(() => ({}));
      setTranscripts((p) => ({
        ...p,
        [url]: res.ok && json.text ? json.text : "전사에 실패했어요 — 잠시 후 다시 시도해 주세요.",
      }));
    } catch {
      setTranscripts((p) => ({ ...p, [url]: "전사에 실패했어요 — 네트워크를 확인해 주세요." }));
    } finally {
      setBusyUrl(null);
    }
  };

  return (
    <div className="rise-in-1 card flex flex-col gap-2 rounded-[20px] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[14px] font-extrabold text-ink">
          현장 음성 메모{" "}
          <span className="text-[11px] font-medium text-text-3">{voiceMemos.length}개</span>
        </div>
        {/* [AI-36] 브리핑 듣기 — 녹음이 없어도 노트 자체를 읽어준다 */}
        <button
          type="button"
          onClick={() => void playBriefing()}
          className="rounded-[10px] border border-line-strong bg-bg px-3 py-1.5 text-[12px] font-bold text-text-1"
        >
          {ttsState === "loading"
            ? "브리핑 준비 중…"
            : ttsState === "playing"
              ? "⏸ 멈추기"
              : ttsState === "error"
                ? "듣기 실패 — 다시 시도"
                : "🔊 노트 브리핑 듣기"}
        </button>
      </div>

      {voiceMemos.map((u, i) => (
        <div key={u} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={u} controls preload="none" className="h-9 w-full" />
            {isOwner && (
              <button
                type="button"
                onClick={() => void transcribe(u)}
                disabled={busyUrl === u}
                className="shrink-0 rounded-[9px] bg-bg px-2.5 py-1.5 text-[11.5px] font-bold text-text-1 disabled:opacity-60"
              >
                {busyUrl === u ? "전사 중…" : transcripts[u] ? "다시 전사" : "글로 변환"}
              </button>
            )}
          </div>
          {transcripts[u] && (
            <div className="rounded-[10px] bg-bg px-3 py-2 text-[12px] leading-[1.7] text-text-1">
              {transcripts[u]}
              <button
                type="button"
                onClick={() => {
                  try {
                    void navigator.clipboard.writeText(transcripts[u]);
                    setCopied(u);
                  } catch {
                    setCopied(null);
                  }
                }}
                className="ml-2 text-[11px] font-bold text-primary"
              >
                {copied === u ? "복사됨 ✓" : "복사"}
              </button>
              <span className="ml-1 text-[10.5px] text-text-3">
                — 노트 수정에서 메모에 붙여넣어 저장하세요 (음성 메모 {i + 1})
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
