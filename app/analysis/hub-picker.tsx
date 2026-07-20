"use client";

import { useState } from "react";
import Link from "next/link";
import { ComplexPicker, type PickedComplex } from "./ComplexPicker";
import { AiNoteAnalysisCard } from "./ai-note-analysis";

/* ============================================================
   허브 단지 선택기 — 지도/검색(?complexId=·?apt=)에서 고른 단지를 seed로.
   - 왼쪽: 단지 선택기 + 각 도구로 선택 단지를 이어주는 바로가기
   - 오른쪽: 임장노트 AI 분석 카드 (고른 단지 지역 실시세를 컨텍스트로 주입)
   ============================================================ */
export function HubComplexPicker({
  noteId,
  initialComplexId,
  initialApt,
  loggedIn,
}: {
  noteId?: string | null;
  initialComplexId?: string | null;
  initialApt?: string | null;
  loggedIn: boolean;
}) {
  const [picked, setPicked] = useState<PickedComplex | null>(null);

  const chip = "chip chip-soft px-3 py-1.5 text-[11px] no-underline";

  return (
    <div
      id="ai-note-analysis"
      className="rise-in-1 grid scroll-mt-24 grid-cols-1 gap-3.5 md:grid-cols-2"
    >
      {/* 단지 선택기 */}
      <div className="card flex flex-col gap-3 rounded-[20px] p-[22px]">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-[19px]">
          🏢
        </div>
        <div className="text-base font-extrabold text-ink">단지 선택기</div>
        <div className="text-[13px] leading-[1.55] text-text-2">
          지도·검색에서 단지를 고르면 아래 도구가 그 단지·지역 실데이터 기준으로 분석해요
        </div>
        <ComplexPicker
          initialComplexId={initialComplexId}
          initialApt={initialApt}
          onSelect={setPicked}
        />
        {picked && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            <Link href={`/analysis/scenario?complexId=${encodeURIComponent(picked.id)}`} className={chip}>
              시나리오 계산 ›
            </Link>
            <Link
              href={
                picked.regionId
                  ? `/analysis/timing?region=${encodeURIComponent(picked.regionId)}`
                  : `/analysis/timing?complexId=${encodeURIComponent(picked.id)}`
              }
              className={chip}
            >
              타이밍 추세 ›
            </Link>
            <Link href={`/analysis/compare?complexId=${encodeURIComponent(picked.id)}`} className={chip}>
              비교에 담기 ›
            </Link>
          </div>
        )}
      </div>

      {/* 임장노트 AI 분석 (선택 단지 지역 실시세 seed) */}
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
