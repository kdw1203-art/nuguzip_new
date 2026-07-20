"use client";

import { useState } from "react";
import Link from "next/link";

/* ============================================================
   AI 노트 분석 카드 — POST /api/ai/analysis (tool: "ai-inspection")
   401(LOGIN_REQUIRED) → 로그인 안내, 403(QUOTA_EXCEEDED) → 쿼터 안내
   성공 → structuredSummary(headline·bullets) 잉크 다크 패널 표시
   ============================================================ */

type Summary = { headline: string; bullets: string[] };

type CardState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; summary: Summary }
  | { kind: "login" }
  | { kind: "quota"; message: string }
  | { kind: "error"; message: string };

export function AiNoteAnalysisCard({ noteId }: { noteId?: string | null }) {
  const [state, setState] = useState<CardState>({ kind: "idle" });

  const run = async () => {
    if (state.kind === "running") return;
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/ai/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "ai-inspection",
          input: {
            source: "analysis-hub",
            // 노트 상세에서 ?noteId= 로 진입한 경우 해당 노트 컨텍스트 전달
            ...(noteId ? { noteId } : {}),
            request: noteId
              ? "이 임장노트(noteId)의 강점·약점과 확인할 체크리스트를 요약해 주세요."
              : "최근 임장노트의 강점·약점과 확인할 체크리스트를 요약해 주세요.",
          },
        }),
      });
      if (res.status === 401) {
        setState({ kind: "login" });
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        structuredSummary?: { headline?: string; bullets?: string[] };
      } | null;
      if (res.status === 403) {
        setState({
          kind: "quota",
          message:
            data?.error ??
            "이번 달 AI 분석 사용량을 모두 썼어요. 플랜을 올리면 더 쓸 수 있어요.",
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: "error",
          message: data?.error ?? "분석에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }
      const s = data?.structuredSummary;
      setState({
        kind: "done",
        summary: {
          headline: s?.headline ?? "AI 분석 결과가 생성되었습니다.",
          bullets: Array.isArray(s?.bullets) ? s.bullets.slice(0, 3) : [],
        },
      });
    } catch {
      setState({
        kind: "error",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
  };

  return (
    <div className="card flex h-full flex-col gap-2.5 rounded-[20px] p-[22px]">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-[19px]">
        🤖
      </div>
      <div className="text-base font-extrabold text-ink">AI 노트 분석</div>
      <div className="text-[13px] leading-[1.55] text-text-2">
        버튼 한 번으로 내 임장노트를 AI가 점수화·요약해 드려요
      </div>
      {noteId && (
        <div className="rounded-[10px] bg-primary-soft px-3 py-2 text-[11px] font-bold text-primary">
          선택한 노트 기준으로 분석해요
        </div>
      )}

      {state.kind === "done" ? (
        <div className="ai-panel flex flex-col gap-1.5 rounded-[14px] p-3.5">
          <div className="text-xs font-extrabold text-white">
            {state.summary.headline}
          </div>
          {state.summary.bullets.map((b) => (
            <div key={b} className="text-[11px] leading-[1.55] text-ai-text">
              · {b}
            </div>
          ))}
        </div>
      ) : state.kind === "login" ? (
        <div className="flex items-center justify-between rounded-[12px] bg-primary-soft px-3 py-2.5">
          <span className="text-xs font-bold text-primary">
            AI 분석은 로그인 후 이용할 수 있어요
          </span>
          <Link
            href="/login"
            className="shrink-0 text-xs font-extrabold text-primary"
          >
            로그인 ›
          </Link>
        </div>
      ) : state.kind === "quota" ? (
        <div className="flex flex-col gap-1.5 rounded-[12px] bg-danger-soft px-3 py-2.5">
          <span className="text-xs font-bold text-danger">{state.message}</span>
          <Link
            href="/subscription"
            className="text-xs font-extrabold text-primary"
          >
            플랜 업그레이드 보기 ›
          </Link>
        </div>
      ) : state.kind === "error" ? (
        <div className="rounded-[12px] bg-danger-soft px-3 py-2.5 text-xs font-bold text-danger">
          {state.message}
        </div>
      ) : null}

      <button
        type="button"
        onClick={run}
        disabled={state.kind === "running"}
        className="btn-primary btn-cta mt-auto rounded-[11px] p-2.5 text-center text-[13px] disabled:opacity-60"
      >
        {state.kind === "running"
          ? "분석 중…"
          : state.kind === "done"
            ? "다시 분석하기"
            : "AI 분석 실행"}
      </button>
    </div>
  );
}
