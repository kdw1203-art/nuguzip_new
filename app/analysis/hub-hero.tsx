"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { ComplexPicker } from "./ComplexPicker";
import {
  TIERS,
  WORKBENCH_CORE,
  workbenchCard,
  type TierId,
} from "./tool-catalog";
import { useHubPicked } from "./hub-context";
import { LastToolChip } from "./tool-cards-client";

/* ============================================================
   분석 허브 히어로 — [UI-05 · UI-10]

   UI-05: 예전엔 단지 검색기가 화면 **중간**에 있었다(워크벤치 12장·시작 카드
   아래). 이 허브의 모든 도구가 "단지 하나"에서 출발하는데 출발점이 접혀
   있었던 셈이다. 검색을 화면 첫 요소로 올린다.

   UI-10: "단지 검색 → 자동 로드 → 실행 · 약 1분" 이라는 같은 문장이 카드
   12장에 12번 반복됐다. 절차는 화면당 한 번만 말하면 된다 — 여기 스텝퍼
   하나로 접고, 카드에서는 전부 지운다.

   단지를 고르면 그 자리에서 **바로 실행 가능한 것**을 띄운다. 예전에는 고른
   뒤에도 아래로 스크롤해 카드를 다시 찾아야 했다.
   ============================================================ */

const STEPS: readonly { n: number; label: string }[] = [
  { n: 1, label: "단지 검색" },
  { n: 2, label: "실거래·공급·뉴스 자동 로드" },
  { n: 3, label: "분석 실행" },
];

const TIER_ORDER: readonly TierId[] = ["complex", "market", "record"];

/** 계열 3개로 바로 가는 내비 — 이 페이지의 뼈대가 질문 3개라는 걸 상단에서 알린다. */
function TierNav() {
  const [active, setActive] = useState<TierId | null>(null);

  useEffect(() => {
    const secs = TIER_ORDER.map((id) => document.getElementById(`tier-${id}`)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (secs.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id.replace("tier-", "") as TierId);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 },
    );
    secs.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    /* 모바일에서 세 줄을 잡아먹던 것 → 한 줄 가로 스크롤. 데스크톱에선 그대로 접힌다. */
    <nav
      aria-label="분석 계열 바로가기"
      className="scroll-x-hidden-bar -mx-1 flex w-full gap-1.5 px-1 md:mx-0 md:w-auto md:flex-wrap md:justify-end md:overflow-visible md:px-0"
    >
      {TIER_ORDER.map((id) => {
        const t = TIERS[id];
        const on = active === id;
        return (
          <a
            key={id}
            href={`#tier-${id}`}
            aria-current={on ? "true" : undefined}
            className={`chip t-sub shrink-0 px-3 py-1.5 no-underline transition-colors ${
              on
                ? "chip-active"
                : "border border-line bg-surface font-bold text-text-2 hover:text-primary"
            }`}
          >
            {t.question}
          </a>
        );
      })}
    </nav>
  );
}

export function HubHero({
  initialComplexId,
  initialApt,
}: {
  initialComplexId?: string | null;
  initialApt?: string | null;
}) {
  const { picked, setPicked, query: q } = useHubPicked();
  const regionHref = picked?.regionId
    ? `/analysis/timing?region=${encodeURIComponent(picked.regionId)}`
    : `/analysis/timing${q}`;

  return (
    <section className="hub-hero sheen rise-in card-pad-lg flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="t-caption font-bold uppercase tracking-wider text-primary">
            누구집 분석 도구
          </span>
          <h1 className="t-display text-balance text-ink">
            무엇을 분석해 볼까요?
          </h1>
          <p className="t-body max-w-[46ch] text-text-2">
            단지명 하나만 넣으면 국토교통부 실거래·전월세·공급·뉴스를 자동으로 붙여
            분석합니다. 아래 도구는 전부 그 단지·지역 실데이터로 계산해요.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <LastToolChip />
          <TierNav />
        </div>
      </div>

      {/* 검색 — 이 화면의 출발점(UI-05) */}
      <div className="card rounded-[14px] p-3.5">
        <ComplexPicker
          initialComplexId={initialComplexId}
          initialApt={initialApt}
          onSelect={setPicked}
          showChip={false}
          label="① 단지 검색"
          placeholder="단지명으로 검색 (예: 은마아파트)"
        />

        {/* 절차는 화면당 한 번만 — 카드 12장의 반복 문구를 여기로 접었다(UI-10) */}
        <div className="hub-steps t-sub mt-3 text-text-3">
          {STEPS.map((s) => (
            <span key={s.n} className="hub-step">
              <span className="hub-step-n">{s.n}</span>
              <span className="font-bold">{s.label}</span>
            </span>
          ))}
          <span className="t-caption ml-auto rounded border border-line px-1.5 py-px font-bold text-text-3">
            보통 1분 안팎
          </span>
        </div>
      </div>

      {/* 고른 즉시 실행 지점을 띄운다 — 다시 아래로 찾아 내려갈 필요가 없다 */}
      {picked && (
        <div className="card flex flex-col gap-2.5 rounded-[14px] p-3.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="t-section text-ink">{picked.name}</span>
            {picked.regionLabel && (
              <span className="t-sub font-bold text-text-2">{picked.regionLabel}</span>
            )}
            {picked.priceLabel && (
              <span className="t-sub t-num text-primary">최근 {picked.priceLabel}</span>
            )}
            <span className="t-caption ml-auto rounded border border-line px-1.5 py-px font-bold text-text-3">
              실데이터 기준
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
            {WORKBENCH_CORE.map((id) => {
              const c = workbenchCard(id);
              return (
                <Link
                  key={id}
                  href={`${c.href}${q}`}
                  className="tile card flex items-center gap-2 rounded-[12px] px-2.5 py-2 no-underline"
                >
                  <span className="tile-ico flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-primary-soft text-primary">
                    <Icon name={c.icon} size={15} />
                  </span>
                  <span className="t-sub min-w-0 flex-1 truncate font-bold text-ink">
                    {c.title}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Link href={regionHref} className="chip chip-soft t-sub px-3 py-1.5 no-underline">
              이 지역 시세·타이밍 ›
            </Link>
            <Link
              href={`/analysis/scenario${q}`}
              className="chip chip-soft t-sub px-3 py-1.5 no-underline"
            >
              시장·대출 시나리오 ›
            </Link>
            <Link
              href={`/analysis/compare${q}`}
              className="chip chip-soft t-sub px-3 py-1.5 no-underline"
            >
              후보 단지 비교에 담기 ›
            </Link>
            <a href="#ai-note-analysis" className="chip chip-soft t-sub px-3 py-1.5 no-underline">
              내 임장노트와 함께 보기 ›
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
