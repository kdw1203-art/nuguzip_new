"use client";

import { useState } from "react";

/**
 * 웹3 — 사전등록자 결제 오픈 알림 발송 버튼.
 * 서버(/api/admin/payments/notify-preorder)가 멱등 처리하므로 이중 클릭에
 * 안전하지만, 발송은 사람이 결정하는 행위라 확인 단계를 한 번 둔다.
 */
export function NotifyPreorderButton() {
  const [phase, setPhase] = useState<"idle" | "confirm" | "busy">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function send() {
    setPhase("busy");
    setResult(null);
    try {
      const res = await fetch("/api/admin/payments/notify-preorder", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        registered?: number;
        anonymous?: number;
        alreadyNotified?: number;
        sent?: number;
        failed?: string[];
      };
      if (!res.ok) {
        setResult(`실패: ${j.error ?? res.status}`);
      } else {
        const parts = [
          `발송 ${j.sent ?? 0}건`,
          `기발송 제외 ${j.alreadyNotified ?? 0}명`,
          `비로그인 등록 ${j.anonymous ?? 0}건은 연락 수단이 없어 제외`,
        ];
        if (j.failed && j.failed.length > 0) parts.push(`실패 ${j.failed.length}건: ${j.failed.join(", ")}`);
        setResult(parts.join(" · "));
      }
    } catch {
      setResult("네트워크 오류 — 다시 시도해 주세요.");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div>
      {phase === "confirm" ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold text-ink">
            미발송 사전등록자 전원에게 인앱 알림을 보낼까요?
          </span>
          <button
            type="button"
            onClick={send}
            className="btn-primary rounded-[10px] px-3 py-1.5 text-[12px]"
          >
            발송
          </button>
          <button
            type="button"
            onClick={() => setPhase("idle")}
            className="rounded-[10px] border border-line px-3 py-1.5 text-[12px] font-bold text-text-2"
          >
            취소
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setPhase("confirm")}
          disabled={phase === "busy"}
          className="rounded-[10px] border border-line bg-surface px-3 py-1.5 text-[12px] font-bold text-text-1 disabled:opacity-50"
        >
          {phase === "busy" ? "발송 중…" : "사전등록자에게 오픈 알림 발송"}
        </button>
      )}
      {result && <p className="mt-1.5 text-[12px] leading-[1.6] text-text-2">{result}</p>}
    </div>
  );
}
