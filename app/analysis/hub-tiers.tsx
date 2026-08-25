"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import {
  TIERS,
  WORKBENCH_CORE,
  WORKBENCH_MORE,
  workbenchCard,
} from "./tool-catalog";
import { useHubPicked } from "./hub-context";

/* ============================================================
   워크벤치 그리드 — [UI-03 · UI-06 · UI-08 · UI-10]

   예전: 12장이 한꺼번에 펼쳐졌고, 12장 모두 밑줄에 "단지 검색 → 자동 로드 →
   실행 · 약 1분" 이라는 **같은 문장**을 달고 있었다. 30일 실행 0회였던 화면에서
   가장 먼저 줄여야 할 소음이 이거였다.

   지금: 실제로 쓰인 4종(CORE_AI_TOOL_IDS)만 펼치고 나머지 8종은 접는다.
   절차 문구는 히어로 스텝퍼 한 곳으로 갔다. 아이콘은 이모지 대신 선형 세트다
   (기기·폰트마다 모양이 달라지지 않는다).
   ============================================================ */

export function WorkbenchGrid() {
  const [expanded, setExpanded] = useState(false);
  const { picked, query } = useHubPicked();
  const tier = TIERS.complex;

  const ids = expanded ? [...WORKBENCH_CORE, ...WORKBENCH_MORE] : WORKBENCH_CORE;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {ids.map((id) => {
          const c = workbenchCard(id);
          return (
            <Link
              key={id}
              href={`${c.href}${query}`}
              className="tile card flex flex-col gap-1.5 rounded-[14px] p-3.5 no-underline"
            >
              <span
                className={`tile-ico flex h-9 w-9 items-center justify-center rounded-[11px] ${tier.iconClass}`}
              >
                <Icon name={c.icon} size={17} />
              </span>
              <span className="t-section text-ink">{c.title}</span>
              <span className="t-sub text-text-2">{c.desc}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="chip t-sub inline-flex items-center gap-1.5 border border-line bg-surface px-3.5 py-2 font-bold text-text-2 transition-colors hover:text-primary"
        >
          {expanded ? "자주 쓰는 4개만 보기" : `나머지 ${WORKBENCH_MORE.length}개 더 보기`}
          <span className={expanded ? "rotate-180" : ""} aria-hidden="true">
            ▾
          </span>
        </button>
        {picked ? (
          <span className="t-sub text-text-3">
            <span className="font-bold text-primary">{picked.name}</span> 기준으로 열려요
          </span>
        ) : (
          <span className="t-sub text-text-3">
            위에서 단지를 고르면 모두 그 단지 기준으로 열려요
          </span>
        )}
      </div>
    </div>
  );
}
