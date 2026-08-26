"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getHomePersonal } from "@/lib/client/home-personal";
import type { KpiRegion, KpiTemp } from "./HomeKpiRow";

/* ============================================================
   홈의 주제 — "지금 내 지역에서 무슨 일이 있었나" 한 줄. (A01·A02·A03·A12)

   왜 바뀌었나(소유자 지적 2026-08-26): 예전 홈은 KPI 4칸을 나란히 놨는데
   앞의 셋은 **시장 사실**(지역 평균·시장 온도·거래 건수)이고 넷째는 **나의
   상태**(내 임장 레벨)였다. 같은 카드 모양에 담기니 같은 종류로 읽혔고,
   그래서 "이 화면이 무슨 이야기를 하는 건지" 가 흐려졌다.

   게다가 "강남구 평균"의 강남구는 사용자의 관심지역이 아니다 —
   lib/newui/home-data.ts 의 CARD_REGIONS 에 박아 둔 4개 중 첫 번째다.
   화면에 근거가 없으니 "왜 강남이지?" 가 된다. 이제 어디서 온 지역인지
   배지로 밝히고, 관심지역이 있으면 그쪽으로 바꿔 준다.

   구조:
     · 문장 하나 — 가장 큰 변화만
     · 그 아래 보조 지표 줄 — 작게, 부차적으로
     · 근거 배지 — "대표 지역" 이면 내 지역으로 바꾸는 길을 함께
   내 임장 레벨은 여기서 빠졌다. 개인 영역(HomeEngagementCard 옆)으로 간다.
   ============================================================ */

type Personal = {
  primaryRegion: string | null;
  /** /api/home/personal 의 HomeRegionCard — tone 을 이미 갖고 있다 */
  regionMarket: {
    name: string;
    price: string;
    delta: string;
    tone: KpiRegion["tone"];
    meta: string;
  } | null;
};

function sentence(name: string, price: string, delta: string, tone: KpiRegion["tone"]): string {
  const d = delta.replace(/[▲▼]/g, "").trim();
  if (tone === "up") return `${name} 아파트 평균이 ${price}, 지난달보다 ${d} 올랐어요.`;
  if (tone === "down") return `${name} 아파트 평균이 ${price}, 지난달보다 ${d} 내렸어요.`;
  return `${name} 아파트 평균은 ${price}, 지난달과 비슷해요.`;
}

export function HomeTodayLine({
  region,
  temp,
  saleIndex,
}: {
  region: KpiRegion | null;
  temp: KpiTemp | null;
  /** 매매지수(서울) — 없으면 보조 줄에서 빠진다 */
  saleIndex?: string | null;
}) {
  /* 서버는 대표 지역으로 그린다(ISR 캐시 유지). 로그인 사용자는 붙은 뒤
     자기 관심지역으로 바뀐다 — 개인 정보가 캐시에 섞이지 않게 하는 기존 규칙. */
  const [mine, setMine] = useState<Personal | null>(null);
  useEffect(() => {
    let dead = false;
    /* 공유 프라미스 — 홈 한 번에 이 라우트가 여러 번 나가지 않게(lib/client/home-personal). */
    getHomePersonal<Personal>()
      .then((j) => {
        if (!dead && j) setMine(j);
      })
      .catch(() => {
        /* 개인화 실패는 홈을 죽일 이유가 아니다 — 대표 지역 그대로 둔다. */
      });
    return () => {
      dead = true;
    };
  }, []);

  const personalized = Boolean(mine?.primaryRegion && mine?.regionMarket);
  const shown: KpiRegion | null = personalized
    ? {
        name: mine!.regionMarket!.name,
        price: mine!.regionMarket!.price,
        delta: mine!.regionMarket!.delta,
        tone: mine!.regionMarket!.tone,
        /* 건수는 그 지역의 meta("서울 · 120건")에서 뽑는다 —
           대표 지역 건수를 내 지역 옆에 붙이면 남의 숫자가 내 것처럼 보인다. */
        tradeLabel: mine!.regionMarket!.meta.match(/([\d,]+건)/)?.[1] ?? null,
        href: `/map?region=${encodeURIComponent(mine!.regionMarket!.name)}`,
      }
    : region;

  /* 지역 시세를 못 읽었으면 문장을 지어내지 않는다. 온도라도 있으면 그것만 말한다. */
  const line = shown
    ? sentence(shown.name, shown.price, shown.delta, shown.tone)
    : temp
      ? `이번 주 시장 온도는 ${temp.score}점이에요. ${temp.headline}`
      : null;

  if (!line) return null;

  const metrics: Array<{ k: string; v: string; href: string }> = [];
  if (temp) metrics.push({ k: "시장 온도", v: `${temp.score}/100`, href: "/analysis/temperature" });
  if (shown?.tradeLabel) metrics.push({ k: "최근 거래", v: shown.tradeLabel, href: "/analysis/price" });
  if (saleIndex && saleIndex !== "—") metrics.push({ k: "매매지수 서울", v: saleIndex, href: "/analysis/timing" });

  return (
    <section aria-labelledby="home-today" className="card rounded-2xl px-[18px] py-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id="home-today" className="t-sub font-extrabold text-text-3">
          오늘의 한 줄
        </h2>
        {/* 근거 배지 — 이 지역이 어디서 왔는지 밝힌다. 없으면 사용자는
            자기 지역이라고 오해하거나 "왜 강남?" 에서 멈춘다. */}
        <span
          className="rounded-[5px] px-1.5 py-px t-caption font-extrabold"
          style={
            personalized
              ? { background: "var(--success-soft)", color: "var(--success)" }
              : { background: "var(--bg)", color: "var(--text-3)" }
          }
        >
          {personalized ? "내 관심지역" : "대표 지역"}
        </span>
        {!personalized && (
          <Link href="/my/settings#region" className="ml-auto t-sub font-bold text-primary no-underline">
            내 지역으로 바꾸기 ›
          </Link>
        )}
      </div>

      <p className="mt-1.5 t-title text-ink">{line}</p>

      {metrics.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-divider pt-2.5">
          {metrics.map((m) => (
            <Link
              key={m.k}
              href={m.href}
              className="flex items-baseline gap-1.5 no-underline"
            >
              <span className="t-caption text-text-3">{m.k}</span>
              <span className="t-body font-bold tabular-nums text-text-1">{m.v}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
