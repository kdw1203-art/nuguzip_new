"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* 누구집 AI 에이전트 채팅.
   차별점(사실 우선)을 UI로 드러낸다: 답변마다 에이전트가 실제로 조회한
   데이터(내 노트·실거래·지역 시세)의 목록을 회색 칩으로 보여 준다.
   조회 내역이 없는 일반 답변과, 데이터를 읽고 한 답변이 한눈에 구분된다. */

type TraceEntry = { tool: string; label: string; ok: boolean };

type ChatMsg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; trace: TraceEntry[]; model?: string };

export type AgentModelChoice = { id: string; label: string; description: string };

const SUGGESTIONS = [
  "내 임장노트 요약해줘",
  "내가 본 단지 중 점수가 가장 높은 곳은?",
  "강남구 최근 시장 상황 알려줘",
  "내 노트의 단지 실거래가는 지금 어때?",
];

function formatRetryAfter(sec: number): string {
  if (sec >= 60) return `약 ${Math.ceil(sec / 60)}분`;
  return `${sec}초`;
}

export function AgentChat({ models }: { models: AgentModelChoice[] }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* 실패한 마지막 질문 — "다시 시도" 버튼으로 그대로 재전송한다 */
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  /* 서버 X-RateLimit-* 헤더에서 읽은 시간당 남은 한도 */
  const [rateInfo, setRateInfo] = useState<{ remaining: number; limit: number } | null>(null);
  const [modelId, setModelId] = useState(models[0]?.id ?? "default");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setLastFailed(null);
    const prev = messages;
    const next: ChatMsg[] = [...prev, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    /* 실패 시 대화를 되돌리고 입력을 복원해 바로 고쳐 보내거나 재시도할 수 있게 한다 */
    const rollback = (retryable: boolean) => {
      setMessages(prev);
      setInput(q);
      if (retryable) setLastFailed(q);
    };

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          model: modelId,
        }),
        signal: controller.signal,
      });

      const limitH = Number(res.headers.get("X-RateLimit-Limit"));
      const remainH = Number(res.headers.get("X-RateLimit-Remaining"));
      if (Number.isFinite(limitH) && limitH > 0 && Number.isFinite(remainH)) {
        setRateInfo({ limit: limitH, remaining: remainH });
      }

      const data = (await res.json().catch(() => null)) as {
        reply?: string;
        trace?: TraceEntry[];
        model?: string;
        error?: string;
        retryAfterSec?: number;
        limit?: number;
      } | null;

      if (res.status === 429) {
        const retrySec = Number(
          data?.retryAfterSec ?? res.headers.get("Retry-After") ?? 0,
        );
        rollback(true);
        setError(
          `시간당 한도(${data?.limit ?? (Number.isFinite(limitH) ? limitH : 12)}회)를 모두 썼어요.` +
            (retrySec > 0 ? ` ${formatRetryAfter(retrySec)} 후 다시 시도할 수 있어요.` : ""),
        );
        return;
      }
      if (!res.ok || !data?.reply) {
        /* 402(월 한도)는 재시도해도 같으니 재시도 버튼을 빼고 안내만 남긴다 */
        rollback(res.status !== 402);
        setError(data?.error ?? "에이전트 응답에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setMessages((cur) => [
        ...cur,
        {
          role: "assistant",
          content: data.reply ?? "",
          trace: data.trace ?? [],
          model: data.model,
        },
      ]);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        /* 사용자가 취소 — 질문을 입력창으로 되돌리고 조용히 종료 */
        rollback(false);
        return;
      }
      rollback(true);
      setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const currentModel = models.find((m) => m.id === modelId);

  return (
    <div className="flex flex-col gap-3">
      {/* 모델 선택 — 키가 설정된 벤더의 모델만 서버가 내려준다 */}
      {models.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[12px] font-bold text-text-2">
            AI 모델
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-[12px] font-bold text-ink outline-none focus:border-primary"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {currentModel && (
            <span className="text-[11px] text-text-3">{currentModel.description}</span>
          )}
        </div>
      )}

      {/* 대화 영역 */}
      <div className="card flex min-h-[380px] flex-col gap-3 rounded-[20px] p-5">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="ai-chip flex h-11 w-11 items-center justify-center rounded-xl text-[15px]">AI</div>
            <div className="text-sm font-extrabold text-ink">
              내 임장노트와 실거래 데이터로 답하는 에이전트예요
            </div>
            <div className="max-w-sm text-xs leading-[1.6] text-text-3">
              답변에 쓰인 숫자는 전부 실제 조회 결과예요 — 어떤 데이터를 읽었는지
              답변 아래에 그대로 표시됩니다.
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="chip chip-soft px-3 py-1.5 text-[12px]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="self-end rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[13px] leading-[1.6] text-white max-w-[85%]">
              {m.content}
            </div>
          ) : (
            <div key={i} className="flex max-w-[92%] flex-col gap-1.5 self-start">
              <div className="rounded-2xl rounded-bl-md bg-bg px-4 py-3 text-[13px] leading-[1.7] text-text-1 whitespace-pre-wrap">
                {m.content}
              </div>
              {(m.trace.length > 0 || m.model) && (
                <div className="flex flex-wrap items-center gap-1 px-1">
                  {m.trace.length > 0 && (
                    <>
                      <span className="text-[10px] font-bold text-text-3">조회한 데이터:</span>
                      {m.trace.map((t, j) => (
                        <span
                          key={j}
                          className={`rounded border px-1.5 py-px text-[10px] font-semibold ${
                            t.ok ? "border-line text-text-2" : "border-line text-text-3 line-through"
                          }`}
                        >
                          {t.label}
                        </span>
                      ))}
                    </>
                  )}
                  {m.model && (
                    <span className="rounded bg-bg px-1.5 py-px text-[10px] font-semibold text-text-3">
                      {m.model}
                    </span>
                  )}
                </div>
              )}
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-center gap-2 self-start rounded-2xl bg-bg px-4 py-3 text-[12px] text-text-3">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-primary" />
            노트·실거래 데이터를 조회하는 중…
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-md border border-line px-2 py-0.5 text-[11px] font-bold text-text-2 hover:border-primary hover:text-primary"
            >
              취소
            </button>
          </div>
        )}
        {error && (
          <div className="flex flex-wrap items-center gap-2 self-start rounded-[12px] bg-danger-soft px-3 py-2.5 text-xs font-bold text-danger">
            <span>{error}</span>
            {lastFailed && !busy && (
              <button
                type="button"
                onClick={() => void send(lastFailed)}
                className="rounded-md border border-danger px-2 py-0.5 text-[11px] font-bold text-danger hover:bg-danger hover:text-white"
              >
                다시 시도
              </button>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder="예: 내 노트 중 교통 점수가 낮았던 단지의 최근 실거래는?"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="shrink-0 rounded-xl border border-line bg-surface px-5 py-3 text-[13px] font-bold text-text-2 hover:border-primary hover:text-primary"
          >
            취소
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="btn-primary shrink-0 rounded-xl px-5 py-3 text-[13px] disabled:opacity-50"
          >
            보내기
          </button>
        )}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] leading-[1.5] text-text-3">
        <span>
          본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다 · 시간당{" "}
          {rateInfo ? `${rateInfo.limit}회 중 ${rateInfo.remaining}회 남음` : "12회"} · 현재
          수도권 실거래 기준
        </span>
        <Link href="/notes/new" className="font-bold text-primary no-underline">
          노트가 없다면 첫 임장노트 쓰기 ›
        </Link>
      </div>
    </div>
  );
}
