"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* ============================================================
   임장노트 AI 분석 카드 — 내 노트 선택 → POST /api/inspection/ai (noteId)
   결과: 노트 점수·텍스트 + 지역 실시세 스냅샷을 합친
   강점/약점/확인 필요/총평 을 .ai-panel 로 표시.
   라벨: LLM 성공 시 "AI 생성", 폴백 시 "규칙 기반 요약".
   401 → 로그인 안내 · 429 → 사용량 안내 (10회/시간)
   ============================================================ */

type NoteOption = {
  id: string;
  title: string;
  region: string;
  aptName?: string | null;
  visitDate: string;
};

type AiResult = {
  mode: "llm" | "rule";
  headline: string;
  verdict: string;
  strengths: string[];
  risks: string[];
  followUps: string[];
  marketSummary: string | null;
  disclaimer: string;
};

type CardState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: AiResult }
  | { kind: "login" }
  | { kind: "quota"; message: string }
  | { kind: "error"; message: string };

const DISCLAIMER = "본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다";

export function AiNoteAnalysisCard({
  noteId,
  loggedIn = true,
  seedComplexName = null,
  seedRegionId = null,
  seedRegionLabel = null,
}: {
  noteId?: string | null;
  loggedIn?: boolean;
  /** 허브 단지 선택기에서 고른 단지명 — 컨텍스트 배너 표시 */
  seedComplexName?: string | null;
  /** 고른 단지 지역의 regionId — 실시세 스냅샷 프리필 */
  seedRegionId?: string | null;
  /** 고른 단지 지역 라벨 — 매칭 노트 자동 선택 */
  seedRegionLabel?: string | null;
}) {
  const [state, setState] = useState<CardState>({ kind: "idle" });
  const [notes, setNotes] = useState<NoteOption[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [selected, setSelected] = useState<string>(noteId ?? "");
  const [seedSnap, setSeedSnap] = useState<{ avgSaleLabel: string; period: string } | null>(
    null,
  );

  useEffect(() => {
    if (!loggedIn) {
      setNotesLoaded(true);
      setState({ kind: "login" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/inspection/notes");
        const data = (await res.json().catch(() => null)) as {
          items?: NoteOption[];
        } | null;
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setNotes(
          items.map((n) => ({
            id: n.id,
            title: n.title,
            region: n.region,
            aptName: n.aptName ?? null,
            visitDate: n.visitDate,
          })),
        );
        // ?noteId= 컨텍스트가 없으면 최신 노트를 기본 선택
        setSelected((prev) => prev || items[0]?.id || "");
      } catch {
        if (!cancelled) setNotes([]);
      } finally {
        if (!cancelled) setNotesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // 선택 단지 지역의 실시세 스냅샷 프리필 (컨텍스트 배너)
  useEffect(() => {
    if (!seedRegionId) {
      setSeedSnap(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/ai/market-baseline?regionId=${encodeURIComponent(seedRegionId)}`,
        );
        const d = (await res.json().catch(() => null)) as
          | { available?: boolean; avgSaleLabel?: string; period?: string }
          | null;
        if (cancelled) return;
        setSeedSnap(
          d?.available && d.avgSaleLabel
            ? { avgSaleLabel: d.avgSaleLabel, period: d.period ?? "" }
            : null,
        );
      } catch {
        if (!cancelled) setSeedSnap(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seedRegionId]);

  // 고른 단지 지역과 일치하는 노트가 있으면 자동 선택
  useEffect(() => {
    if (!seedRegionLabel || notes.length === 0) return;
    const key = seedRegionLabel.replace(/^서울\s*/, "").trim();
    const match = notes.find(
      (n) => n.region && (seedRegionLabel.includes(n.region) || n.region.includes(key)),
    );
    if (match) setSelected(match.id);
  }, [seedRegionLabel, notes]);

  const run = async () => {
    if (state.kind === "running" || !selected) return;
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/inspection/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: selected }),
      });
      if (res.status === 401) {
        setState({ kind: "login" });
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        mode?: string;
        report?: {
          headline?: string;
          verdict?: string;
          summary?: string;
          strengths?: string[];
          risks?: string[];
          followUps?: string[];
        };
        marketContext?: { summary?: string } | null;
        disclaimer?: string;
      } | null;
      if (res.status === 429 || res.status === 403) {
        setState({
          kind: "quota",
          message:
            data?.error ??
            "AI 분석 사용량(시간당 10회)을 모두 썼어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }
      if (!res.ok || !data?.report) {
        setState({
          kind: "error",
          message: data?.error ?? "분석에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }
      const r = data.report;
      setState({
        kind: "done",
        result: {
          mode: data.mode === "llm" ? "llm" : "rule",
          headline: r.headline?.trim() || "임장노트 AI 분석 결과",
          verdict: (r.verdict ?? r.summary ?? "").trim(),
          strengths: (r.strengths ?? []).slice(0, 3),
          risks: (r.risks ?? []).slice(0, 3),
          followUps: (r.followUps ?? []).slice(0, 3),
          marketSummary: data.marketContext?.summary ?? null,
          disclaimer: data.disclaimer ?? DISCLAIMER,
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
      <div className="text-base font-extrabold text-ink">임장노트 AI 분석</div>
      <div className="text-[13px] leading-[1.55] text-text-2">
        내 노트의 점수·기록과 지역 실시세를 합쳐 강점·약점·확인 항목을 정리해요
      </div>

      {/* 노트 선택 */}
      {notesLoaded && notes.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-text-3">분석할 노트</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-surface px-2.5 py-2 text-xs font-bold text-ink"
          >
            {notes.map((n) => (
              <option key={n.id} value={n.id}>
                {(n.aptName ? `${n.aptName} · ` : "") + n.title} — {n.region}
              </option>
            ))}
          </select>
        </label>
      )}
      {/* 허브 단지 선택기에서 고른 단지 컨텍스트 (실시세 프리필) */}
      {seedComplexName && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[12px] bg-primary-soft px-3 py-2 text-[11px] font-bold text-primary">
          <span>선택 단지 {seedComplexName}</span>
          {seedRegionLabel && <span className="text-text-2">· {seedRegionLabel}</span>}
          {seedSnap && (
            <span className="text-text-2">
              · 평균 {seedSnap.avgSaleLabel}
              {seedSnap.period ? ` (${seedSnap.period})` : ""}
            </span>
          )}
          <span className="ml-auto rounded border border-line px-1 py-px text-[9px] font-bold text-text-3">
            실데이터 기준
          </span>
        </div>
      )}
      {loggedIn && notesLoaded && notes.length === 0 && state.kind !== "login" && (
        <div className="flex items-center justify-between rounded-[12px] bg-primary-soft px-3 py-2.5">
          <span className="text-xs font-bold text-primary">
            분석할 임장노트가 아직 없어요
          </span>
          <Link href="/notes/new" className="shrink-0 text-xs font-extrabold text-primary">
            첫 노트 쓰기 ›
          </Link>
        </div>
      )}

      {state.kind === "done" ? (
        <div className="ai-panel flex flex-col gap-2 rounded-[14px] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-white">
              {state.result.headline}
            </span>
            <span className="shrink-0 rounded border border-[rgba(255,255,255,.25)] px-1.5 py-px text-[9px] font-bold text-ai-muted">
              {state.result.mode === "llm" ? "AI 생성" : "규칙 기반 요약"}
            </span>
          </div>
          {state.result.marketSummary && (
            <div className="rounded-lg bg-[rgba(255,255,255,.07)] px-2.5 py-1.5 text-[10px] font-bold text-ai-accent">
              실시세 {state.result.marketSummary}
            </div>
          )}
          {state.result.strengths.length > 0 && (
            <div>
              <div className="text-[10px] font-extrabold text-ai-accent">강점</div>
              {state.result.strengths.map((b) => (
                <div key={b} className="text-[11px] leading-[1.55] text-ai-text">
                  · {b}
                </div>
              ))}
            </div>
          )}
          {state.result.risks.length > 0 && (
            <div>
              <div className="text-[10px] font-extrabold text-[#ffb0b0]">약점·리스크</div>
              {state.result.risks.map((b) => (
                <div key={b} className="text-[11px] leading-[1.55] text-ai-text">
                  · {b}
                </div>
              ))}
            </div>
          )}
          {state.result.followUps.length > 0 && (
            <div>
              <div className="text-[10px] font-extrabold text-ai-muted">확인 필요</div>
              {state.result.followUps.map((b) => (
                <div key={b} className="text-[11px] leading-[1.55] text-ai-text">
                  · {b}
                </div>
              ))}
            </div>
          )}
          {state.result.verdict && (
            <div className="border-t border-[rgba(255,255,255,.12)] pt-1.5 text-[11px] leading-[1.55] text-ai-text">
              <b className="text-white">총평</b> — {state.result.verdict}
            </div>
          )}
          <div className="text-[9px] leading-[1.5] text-ai-muted">
            {state.result.disclaimer}.
          </div>
        </div>
      ) : state.kind === "login" ? (
        <div className="flex items-center justify-between rounded-[12px] bg-primary-soft px-3 py-2.5">
          <span className="text-xs font-bold text-primary">
            AI 분석은 로그인 후 이용할 수 있어요
          </span>
          <Link href="/login" className="shrink-0 text-xs font-extrabold text-primary">
            로그인 ›
          </Link>
        </div>
      ) : state.kind === "quota" ? (
        <div className="flex flex-col gap-1.5 rounded-[12px] bg-danger-soft px-3 py-2.5">
          <span className="text-xs font-bold text-danger">{state.message}</span>
        </div>
      ) : state.kind === "error" ? (
        <div className="rounded-[12px] bg-danger-soft px-3 py-2.5 text-xs font-bold text-danger">
          {state.message}
        </div>
      ) : null}

      <button
        type="button"
        onClick={run}
        disabled={
          state.kind === "running" || !loggedIn || (notesLoaded && notes.length === 0)
        }
        className="btn-primary btn-cta mt-auto rounded-[11px] p-2.5 text-center text-[13px] disabled:opacity-60"
      >
        {state.kind === "running"
          ? "분석 중…"
          : state.kind === "done"
            ? "다시 분석하기"
            : "분석 실행"}
      </button>
    </div>
  );
}
