"use client";

import { AiNoteAnalysisCard } from "./ai-note-analysis";
import { useHubPicked } from "./hub-context";

/* ============================================================
   임장노트 AI 분석 — 허브에서 "내 기록" 계열의 실행 카드.

   [UI-01·05] 예전에는 이 자리에 **단지 선택기 카드가 하나 더** 있었다.
   히어로에 검색을 올리면서(UI-05) 그 카드는 통째로 사라졌다 — 한 화면에
   같은 검색창이 둘일 이유가 없고, 진입점 23개를 줄이는 첫 삭제이기도 하다.
   고른 단지는 이제 허브 전체가 공유한다(hub-context).
   ============================================================ */
export function HubNoteAnalysis({
  noteId,
  loggedIn,
  className,
}: {
  noteId?: string | null;
  loggedIn: boolean;
  /** 그리드 안에 놓일 때 열 span 등 — 카드 자체는 h-full 이라 늘어난다 */
  className?: string;
}) {
  const { picked } = useHubPicked();
  return (
    <div id="ai-note-analysis" className={`scroll-mt-24 ${className ?? ""}`}>
      <AiNoteAnalysisCard
        noteId={noteId ?? null}
        loggedIn={loggedIn}
        seedComplexName={picked?.name ?? null}
        seedRegionId={picked?.regionId ?? null}
        seedRegionLabel={picked?.regionLabel ?? null}
      />
    </div>
  );
}
