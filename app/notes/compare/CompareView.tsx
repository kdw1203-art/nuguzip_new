"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "@/app/components/Icon";

/* 표 / 타임라인 뷰 전환 — 상호작용(토글)만 클라이언트로 격리.
   두 뷰 모두 page.tsx 에서 동일한 예시 데이터로 서버 렌더된 노드를 받는다. */

type ViewMode = "table" | "timeline";

const TABS: { id: ViewMode; label: string; icon: string }[] = [
  { id: "table", label: "표", icon: "bar" },
  { id: "timeline", label: "타임라인", icon: "clock" },
];

export function CompareView({
  table,
  timeline,
}: {
  table: ReactNode;
  timeline: ReactNode;
}) {
  const [view, setView] = useState<ViewMode>("table");

  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="tablist"
        aria-label="회차 비교 보기 방식"
        className="flex items-center gap-1 self-start rounded-2xl bg-[#f2f4f8] p-1"
      >
        {TABS.map((t) => {
          const active = view === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(t.id)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold transition ${
                active ? "bg-surface text-primary shadow-sm" : "text-text-3"
              }`}
            >
              <Icon name={t.icon} size={15} className="inline align-middle" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div>{view === "table" ? table : timeline}</div>
    </div>
  );
}
