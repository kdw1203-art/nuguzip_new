"use client";

import { useEffect, useRef, useState } from "react";

/** 복귀 안내를 보여 주는 시간 */
const BACK_ONLINE_MS = 2500;

type Phase = "hidden" | "offline" | "back";

/**
 * [966] 전역 오프라인 띠 — 탭바 위 가운데 작은 알약.
 *
 * navigator.onLine 은 "확실히 끊김"만 믿을 수 있는 신호라(true 여도 실제 통신은
 * 실패할 수 있다) 끊김 안내에만 쓴다. 끊기면 띄우고, 돌아오면 "다시 연결됐어요"를
 * 2.5초 보여 준 뒤 접는다. 처음부터 온라인이면 아무것도 그리지 않는다.
 *
 * 임장노트 작성 화면(app/notes/new/NoteForm.tsx)의 오프라인 안내는 "지금 임시저장이
 * 돌고 있다"는 그 화면만의 사실을 말하므로 그대로 둔다 — 이 띠는 모든 화면 공통.
 *
 * 우하단(맨 위로·글쓰기 FAB)과 겹치지 않게 폭을 화면 양쪽 76px 씩 비운다.
 */
export function OfflineBanner() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
    const goOffline = () => {
      clear();
      setPhase("offline");
    };
    const goOnline = () => {
      clear();
      /* 끊긴 적이 없으면(마운트 뒤 첫 online 이벤트) 복귀 안내도 필요 없다 */
      setPhase((p) => (p === "offline" ? "back" : p));
      timer.current = setTimeout(() => setPhase("hidden"), BACK_ONLINE_MS);
    };
    if (!navigator.onLine) setPhase("offline");
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      clear();
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-noprint
      className="offline-banner fixed z-[60] flex items-center gap-2 rounded-full bg-brand-hanji px-3.5 py-2 t-sub font-bold text-brand-hanji-ink shadow-[var(--shadow-md)]"
      style={{ bottom: "calc(var(--nz-tabbar-offset) + 8px)" }}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${phase === "offline" ? "bg-brand-red" : "bg-success"}`}
      />
      <span className="min-w-0">
        {phase === "offline" ? "오프라인이에요 — 연결되면 자동으로 이어집니다" : "다시 연결됐어요"}
      </span>
    </div>
  );
}
