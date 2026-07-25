"use client";

import { useState } from "react";
import Link from "next/link";

/* ============================================================
   무엇이든 물어보기 — 보호된 POST /api/ai/chat 실연결 카드.
   401 → 로그인 안내 · 429 → 사용량 안내(시간당 10회) ·
   5xx → 오류 메시지 + 다시 시도. 성공 시 답변 텍스트 표시.
   ============================================================ */

type AskState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; reply: string }
  | { kind: "login" }
  | { kind: "error"; message: string };

export function AskAiCard({ loggedIn }: { loggedIn: boolean }) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>(
    loggedIn ? { kind: "idle" } : { kind: "login" },
  );

  const ask = async () => {
    const q = question.trim();
    if (!q || state.kind === "running") return;
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: q }] }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        reply?: string;
        error?: string;
      } | null;
      if (res.status === 401) {
        setState({ kind: "login" });
        return;
      }
      if (res.status === 429) {
        setState({
          kind: "error",
          message:
            data?.error ?? "질문 사용량(시간당 10회)을 모두 썼어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }
      if (!res.ok || !data?.reply) {
        setState({
          kind: "error",
          message: data?.error ?? "답변 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }
      setState({ kind: "done", reply: data.reply });
    } catch {
      setState({
        kind: "error",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
  };

  return (
    <div className="ai-panel flex flex-col gap-2.5 rounded-[20px] p-[22px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
      <div className="ai-chip h-10 w-10 rounded-xl text-[15px]">AI</div>
      <div className="text-base font-extrabold text-white">무엇이든 물어보기</div>
      <div className="text-[13px] leading-[1.55] text-ai-text">
        “관양동에서 9억 예산이면 어디부터 볼까?”
      </div>

      {state.kind === "login" ? (
        <div className="flex items-center justify-between gap-2 rounded-[10px] bg-[rgba(255,255,255,.08)] px-3 py-[9px]">
          <span className="text-xs text-ai-muted">로그인하면 바로 질문할 수 있어요</span>
          <Link href="/login" className="shrink-0 text-xs font-extrabold text-ai-accent">
            로그인 ›
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
          className="flex items-center gap-1.5 rounded-[10px] bg-[rgba(255,255,255,.08)] px-3 py-[7px]"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="질문 입력…"
            maxLength={500}
            aria-label="AI에게 질문하기"
            className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-ai-muted"
          />
          <button
            type="submit"
            disabled={state.kind === "running" || !question.trim()}
            className="shrink-0 text-xs font-extrabold text-ai-accent disabled:opacity-50"
          >
            {state.kind === "running" ? "답변 중…" : "↵ 보내기"}
          </button>
        </form>
      )}

      {state.kind === "done" && (
        <div className="max-h-[220px] overflow-y-auto whitespace-pre-wrap rounded-[10px] bg-[rgba(255,255,255,.07)] px-3 py-2.5 text-xs leading-[1.65] text-ai-text">
          {state.reply}
        </div>
      )}
      {state.kind === "error" && (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[rgba(255,255,255,.07)] px-3 py-2.5">
          <span className="flex-1 text-xs leading-[1.5] text-[#ffb0b0]">
            {state.message}
          </span>
          <button
            type="button"
            onClick={() => void ask()}
            className="shrink-0 rounded border border-[rgba(255,255,255,.25)] px-2 py-0.5 text-[11px] font-bold text-ai-accent"
          >
            다시 시도
          </button>
        </div>
      )}
      {state.kind === "done" && (
        <div className="text-[9px] leading-[1.5] text-ai-muted">
          본 답변은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
        </div>
      )}
    </div>
  );
}
