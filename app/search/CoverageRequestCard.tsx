"use client";

import { useState } from "react";

/* 검색 무결과 → 커버리지 수요 수집 카드(#413).
 *
 * 실거래 상세 데이터가 수도권 일부인 것이 성장의 유리천장이다. 커버 밖
 * 방문자를 그냥 보내는 대신 "열리면 알려드릴게요"로 수요를 지도화해,
 * 지역 확장 우선순위를 감이 아니라 이 숫자로 정한다.
 * 이메일은 선택 — 없어도 검색어 자체가 수요 1표다. */

export function CoverageRequestCard({ query }: { query: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const submit = async () => {
    if (state === "busy" || state === "done") return;
    setState("busy");
    try {
      const res = await fetch("/api/coverage/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          source: "search",
          email: email.trim() || undefined,
        }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="mt-5 w-full max-w-[520px] rounded-2xl border border-primary/25 bg-primary-soft px-4 py-3.5 text-center">
        <div className="t-body font-extrabold text-primary">
          수요를 기록했어요 — 확장 우선순위에 반영됩니다
        </div>
        {email.trim() && (
          <div className="mt-0.5 t-sub text-text-2">
            이 지역 데이터가 열리면 알려드릴게요.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card mt-5 flex w-full max-w-[520px] flex-col gap-2.5 rounded-2xl px-4 py-4 text-left">
      <div>
        <div className="t-body font-extrabold text-ink">
          찾는 지역이 아직 안 열렸나요?
        </div>
        <p className="mt-0.5 t-sub text-text-2">
          실거래 상세 데이터는 수도권 주요 지역부터 순차 확장 중이에요. 요청이
          많은 지역부터 엽니다 — 이 검색어를 수요로 기록해 두세요.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="(선택) 열리면 알림 받을 이메일"
          aria-label="열리면 알림 받을 이메일 (선택)"
          maxLength={120}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={state === "busy"}
          className="btn-primary shrink-0 rounded-xl px-4 py-2.5 t-body disabled:opacity-60"
        >
          {state === "busy" ? "기록 중…" : "열리면 알려주세요"}
        </button>
      </div>
      {state === "error" && (
        <p className="t-sub font-semibold text-danger">
          지금은 기록하지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}
