"use client";

import { useState } from "react";
import Link from "next/link";
import type { NoteDraft } from "@/lib/ai/note-draft-core";

/* [944 · AI 대개편] 단지 상세 "AI 예습 브리핑" — 방문 전에 데이터 예습을 한 장으로.
 * 같은 초안 엔진(/api/ai/note-draft)을 쓰므로 한도도 같은 카운터(무료 월 10회)다.
 * 브리핑 → "이 내용으로 노트 시작" 은 기존 프리필 링크로 잇는다(작성 화면의
 * AI 초안 패널이 같은 내용을 다시 만들 수 있어, 여기서는 이동만 한다). */

export function AiBriefingCard({
  complexId,
  region,
  aptName,
  noteHref,
}: {
  complexId: string;
  region: string;
  aptName: string;
  noteHref: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "quota" | "error">("idle");
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number | null; plan: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function run() {
    if (state === "busy") return;
    setState("busy");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ai/note-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionName: region, aptName, complexId }),
      });
      if (res.status === 401) {
        setErrorMsg("예습 브리핑은 로그인 후 이용할 수 있어요.");
        setState("error");
        return;
      }
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        draft?: NoteDraft;
        usage?: { used: number; limit: number | null; plan: string };
        error?: string;
      };
      if (json.usage) setUsage(json.usage);
      if (json.ok === false && json.reason === "quota") {
        setState("quota");
        return;
      }
      if (!res.ok || !json.ok || !json.draft) {
        setErrorMsg(json.error ?? "브리핑을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
        setState("error");
        return;
      }
      setDraft(json.draft);
      setState("done");
    } catch {
      setErrorMsg("연결이 불안정해요. 잠시 후 다시 시도해 주세요.");
      setState("error");
    }
  }

  return (
    <section className="card flex flex-col gap-2 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="t-body font-extrabold text-ink">✨ AI 예습 브리핑</h2>
          <p className="mt-0.5 t-caption text-text-3">
            방문 전에 이 단지의 실거래·시세·공급 데이터를 한 장으로 예습하세요.
          </p>
        </div>
        {state !== "done" && (
          <button
            type="button"
            onClick={() => void run()}
            disabled={state === "busy"}
            className="btn-soft rounded-xl px-3.5 py-2 t-sub font-bold text-primary disabled:opacity-50"
          >
            {state === "busy" ? "브리핑 만드는 중…" : "브리핑 받기"}
          </button>
        )}
      </div>

      {state === "done" && draft && (
        <div className="flex flex-col gap-2">
          <p className="t-body font-bold text-ink">{draft.summary}</p>
          {draft.evidence.length > 0 && (
            <ul className="flex flex-col gap-1">
              {draft.evidence.slice(0, 6).map((e) => (
                <li key={e} className="t-sub text-text-2">
                  · {e}
                </li>
              ))}
            </ul>
          )}
          {draft.todo.length > 0 && (
            <div>
              <div className="t-sub font-extrabold text-text-1">현장에서 확인할 것</div>
              <ul className="mt-1 flex flex-col gap-1">
                {draft.todo.slice(0, 5).map((t) => (
                  <li key={t} className="t-sub text-text-2">
                    ☐ {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {draft.scoreRationale && (
            <p className="t-caption text-text-3">
              <b className="text-[#b45309]">AI 추정(현장 확인 전)</b> — {draft.scoreRationale}
            </p>
          )}
          <Link
            href={noteHref}
            className="btn-primary mt-1 w-fit rounded-xl px-3.5 py-2 t-sub font-bold no-underline"
          >
            이 단지 임장노트 시작 →
          </Link>
        </div>
      )}

      {state === "quota" && (
        <p className="t-caption text-text-2">
          이번 달 AI 초안·브리핑 {usage?.limit ?? ""}회를 모두 썼어요.{" "}
          {usage?.plan === "free" ? (
            <>
              <Link href="/subscription" className="font-bold text-primary underline">
                플러스
              </Link>
              에서 월 100회까지 이용할 수 있어요.
            </>
          ) : (
            "다음 달 1일에 초기화됩니다."
          )}
        </p>
      )}
      {state === "error" && errorMsg && (
        <p role="alert" className="t-caption font-semibold text-danger">
          {errorMsg}
        </p>
      )}

      <p className="t-caption text-text-3">
        공개 데이터 기반 참고용이며, 투자 판단의 책임은 이용자 본인에게 있습니다.
      </p>
    </section>
  );
}
