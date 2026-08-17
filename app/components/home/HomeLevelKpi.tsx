"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionLite } from "@/lib/client/session-lite";
import { getHomePersonal } from "@/lib/client/home-personal";

/* KPI ④ 내 임장 레벨 — 로그인 시 /api/home/personal 의 regionLevel(실측
 * 노트 카운트 기반), 비로그인은 시작 CTA. 조회 실패는 실패라고 말하지 않고
 * 조용히 CTA 로 접는다(곁다리 칸 — 홈 첫 화면에서 오류 문구는 과하다). */

interface PersonalLevelSlice {
  noteCount: number | null;
  regionLevel: { regionCount: number; topLevel: number; topLabel: string | null } | null;
}

export function HomeLevelKpi() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "anon" }
    | { kind: "level"; top: number; label: string; regions: number; notes: number }
    | { kind: "start"; notes: number }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await getSessionLite();
      if (cancelled) return;
      if (!session) {
        setState({ kind: "anon" });
        return;
      }
      const p = await getHomePersonal<PersonalLevelSlice>();
      if (cancelled) return;
      const lv = p?.regionLevel ?? null;
      const notes = p?.noteCount ?? 0;
      if (lv && lv.regionCount > 0 && lv.topLabel) {
        setState({
          kind: "level",
          top: lv.topLevel,
          label: lv.topLabel,
          regions: lv.regionCount,
          notes,
        });
      } else {
        setState({ kind: "start", notes });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div aria-hidden className="card animate-pulse rounded-2xl px-4 py-3">
        <div className="h-3 w-14 rounded bg-[#eef1f6]" />
        <div className="mt-2 h-5 w-20 rounded bg-[#eef1f6]" />
        <div className="mt-1.5 h-3 w-16 rounded bg-[#eef1f6]" />
      </div>
    );
  }

  if (state.kind === "level") {
    return (
      <Link
        href="/my"
        className="card card-hover flex flex-col gap-0.5 rounded-2xl px-4 py-3 no-underline"
      >
        <span className="text-[10.5px] font-bold text-text-3">내 임장 레벨</span>
        <span className="text-[19px] font-extrabold leading-tight text-ink">
          Lv.{state.top}
          <span className="ml-1 text-[12px] text-text-2">{state.label}</span>
        </span>
        <span className="text-[11px] font-bold text-text-2">
          {state.regions}개 지역 · 노트 {state.notes}개
        </span>
      </Link>
    );
  }

  const href = state.kind === "anon" ? "/signup" : "/notes/new";
  return (
    <Link
      href={href}
      className="card card-hover flex flex-col gap-0.5 rounded-2xl border-dashed px-4 py-3 no-underline"
    >
      <span className="text-[10.5px] font-bold text-text-3">내 임장 레벨</span>
      <span className="text-[15px] font-extrabold leading-tight text-primary">
        {state.kind === "anon" ? "3분이면 첫 노트" : "첫 지역 레벨 쌓기"}
      </span>
      <span className="text-[11px] font-bold text-text-2">
        {state.kind === "anon"
          ? "로그인 없이 쓰고, 저장할 때 가입해요"
          : "같은 지역 노트 1개면 Lv.1"}
      </span>
    </Link>
  );
}
