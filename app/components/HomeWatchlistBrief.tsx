"use client";

/* [OPT-47] 개인화 홈 카드 — 로그인 + 워치 단지에 최근 거래가 있을 때만 나타난다.
   홈 정적 캐시를 지키기 위한 클라이언트 섬: 없으면 아무것도 렌더하지 않는다
   (자리 확보용 스켈레톤도 없음 — 비로그인 다수에게 레이아웃 이동을 만들지 않기). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionLite } from "@/lib/client/session-lite";

type Brief = {
  title: string;
  body: string;
  complexCount: number;
  tradeCount: number;
  /** [945 #47] 관심지역 브리핑이면 지역 상세로 — 없으면 워치리스트 기본 */
  href?: string;
  linkLabel?: string;
};

export function HomeWatchlistBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);
  useEffect(() => {
    let alive = true;
    /* [2026-08-28] 로그인 여부를 먼저 본다. 예전에는 마운트 즉시 쏴서
       비로그인 방문자마다 401 이 돌아왔고, 크롬 콘솔에 빨간 줄이 남았다.
       세션 조회는 홈이 어차피 하고 있고 모듈 캐시를 공유한다(요청 증가 없음). */
    void getSessionLite()
      .then((s) => {
        if (!alive || !s?.user?.email) return null;
        return fetch("/api/me/home-brief", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : null,
        );
      })
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
        <h2 className="text-[13px] font-bold text-ink">{brief.title}</h2>
        <Link
          href={brief.href ?? "/my/watchlist"}
          className="shrink-0 text-xs font-semibold text-primary"
        >
          {brief.linkLabel ?? "워치리스트 ›"}
        </Link>
      </div>
      <p className="mt-1 text-[13px] text-text-2">{brief.body}</p>
      <p className="mt-1 text-[12px] text-text-3">
        {brief.complexCount > 0
          ? `관심 단지 ${brief.complexCount}곳 · 최근 7일 신규 신고 ${brief.tradeCount}건 · 국토부 실거래 기준`
          : "관심지역 요약 · 국토부 실거래·공표 지수 기준"}
      </p>
    </section>
  );
}
