"use client";

/* [OPT-47] 개인화 홈 카드 — 로그인 + 워치 단지에 최근 거래가 있을 때만 나타난다.
   홈 정적 캐시를 지키기 위한 클라이언트 섬: 없으면 아무것도 렌더하지 않는다
   (자리 확보용 스켈레톤도 없음 — 비로그인 다수에게 레이아웃 이동을 만들지 않기). */
import { useEffect, useState } from "react";
import Link from "next/link";

type Brief = { title: string; body: string; complexCount: number; tradeCount: number };

export function HomeWatchlistBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/me/home-brief", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; brief?: Brief | null } | null) => {
        if (alive && j?.ok && j.brief) setBrief(j.brief);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!brief) return null;
  return (
    <section
      aria-label="내 관심 단지 최근 거래"
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">{brief.title}</h2>
        <Link href="/my/watchlist" className="shrink-0 text-xs font-semibold text-primary">
          워치리스트 ›
        </Link>
      </div>
      <p className="mt-1 text-sm text-text-2">{brief.body}</p>
      <p className="mt-1 text-[11px] text-text-3">
        관심 단지 {brief.complexCount}곳 · 최근 7일 신규 신고 {brief.tradeCount}건 · 국토부 실거래 기준
      </p>
    </section>
  );
}
