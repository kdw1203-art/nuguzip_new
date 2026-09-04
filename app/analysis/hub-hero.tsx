"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CountUp } from "@/app/components/motion/CountUp";
import { Icon } from "@/app/components/Icon";
import { BrandWatermark } from "@/app/components/BrandWatermark";
import { ComplexPicker } from "./ComplexPicker";
import { ToolGlyph, WORKBENCH_GLYPH } from "./ToolGlyph";
import {
  TIERS,
  WORKBENCH_CORE,
  workbenchCard,
  type TierId,
} from "./tool-catalog";
import { useHubPicked } from "./hub-context";
import { LastToolChip } from "./tool-cards-client";

/* ============================================================
   분석 허브 히어로 — [UI-05 · UI-10 · 958]

   UI-05: 검색이 화면 첫 요소. UI-10: 절차는 화면당 한 번(스텝퍼).
   958: 브랜드 네이비 면으로 통일(전문가·동네이야기 허브와 같은 규칙), 그리고
   **말을 사실에 맞춘다** —
     · "보통 1분 안팎" 같은 미측정 약속을 뺐다.
     · 기본 실행은 규칙 계산이고 AI 서술은 선택(로그인)이라는 걸 스텝퍼가 말한다.
     · 무료·플러스·프로 월 한도를 실행 전에 보여 준다(예전엔 다 쓴 뒤에야 알았다).
     · 커버리지(실거래·단지·지역 수)는 홈과 같은 6시간 캐시 실측값 — 0이면 0.
   ============================================================ */

const STEPS: readonly { n: number; label: string }[] = [
  { n: 1, label: "단지 검색" },
  { n: 2, label: "실거래·전월세·공급·뉴스 자동 결합" },
  { n: 3, label: "규칙 계산 → 원하면 AI 서술" },
];

const TIER_ORDER: readonly TierId[] = ["complex", "market", "record"];

export type HubCoverage = {
  txCount: number | null;
  complexCount: number | null;
  regionCount: number | null;
};

/** 월 한도 — lib/subscriptions/access.ts FEATURE_RULES.ai_analysis 와 같은 숫자(서버에서 넘겨 받는다) */
export type HubQuota = { free: number; plus: number; pro: number | null };

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
            className={`chip t-sub shrink-0 px-3 py-1.5 font-bold no-underline transition-colors ${
              on ? "bg-brand-hanji text-brand-hanji-ink" : "brand-photo-chip"
            }`}
          >
            {t.question}
          </a>
        );
      })}
    </nav>
  );
}

/* [961] 숫자가 도착하는 방식 — 실측값을 900ms 동안 세어 올라온다(CountUp). null 은 — */
function Num({ n }: { n: number | null }) {
  return n === null ? <>—</> : <CountUp value={n} />;
}

export function HubHero({
  initialComplexId,
  initialApt,
  coverage,
  quota,
  toolCount,
}: {
  initialComplexId?: string | null;
  initialApt?: string | null;
  coverage: HubCoverage;
  quota: HubQuota;
  toolCount: number;
}) {
  const { picked, setPicked, query: q } = useHubPicked();
  const regionHref = picked?.regionId
    ? `/analysis/timing?region=${encodeURIComponent(picked.regionId)}`
    : `/analysis/timing${q}`;

  return (
    <section className="hub-hero rise-in card-pad-lg flex flex-col gap-4">
      <BrandWatermark />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-[600px] flex-col gap-1.5">
          <span className="t-caption font-extrabold tracking-wider text-on-dark-muted">
            AI 분석 · 단지 하나에서 시작
          </span>
          <h1 className="t-display text-balance text-on-dark">
            단지 하나를 넣으면, 판단 근거가 <span className="text-brand-red-dark">지금</span> 모입니다
          </h1>
          <p className="t-body max-w-[52ch] text-on-dark-muted">
            단지명 하나를 넣으면 국토교통부 실거래·전월세 신고·입주 예정·뉴스를 그 단지 기준으로
            모아 규칙 계산합니다. 원하면 AI 서술을 얹어 문장으로 읽고, 모든 수치에는 출처 각주가
            붙어요.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <LastToolChip />
          <TierNav />
        </div>
      </div>

      {/* 검색 — 이 화면의 출발점(UI-05). 네이비 위 한 장의 밝은 카드 */}
      <div className="card rounded-2xl p-3.5">
        <ComplexPicker
          initialComplexId={initialComplexId}
          initialApt={initialApt}
          onSelect={setPicked}
          showChip={false}
          label="① 단지 검색"
          placeholder="단지명으로 검색 (예: 은마아파트)"
        />

        {/* 절차는 화면당 한 번만(UI-10). 미측정 소요시간 약속은 뺐다(958). */}
        <div className="hub-steps t-sub mt-3 text-text-3">
          {STEPS.map((s) => (
            <span key={s.n} className="hub-step">
              <span className="hub-step-n">{s.n}</span>
              <span className="font-bold">{s.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* 고른 즉시 실행 지점을 띄운다 — 다시 아래로 찾아 내려갈 필요가 없다 */}
      {picked && (
        <div className="card flex flex-col gap-2.5 rounded-2xl p-3.5">
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
                  className="tile card flex items-center gap-2 rounded-[10px] px-2.5 py-2 no-underline"
                >
                  <span className="tile-ico flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                    <ToolGlyph id={WORKBENCH_GLYPH[id] ?? "radar"} size={22} />
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

      {/* 커버리지 + 한도 — 실측만, 실행 전에 미리 */}
      <div className="flex flex-col gap-3 border-t border-on-dark-faint pt-4 md:flex-row md:items-end md:justify-between">
        <div className="grid grid-cols-3 gap-3 md:gap-6">
          <div>
            <div className="t-section t-num text-on-dark"><Num n={coverage.txCount} /></div>
            <div className="t-caption text-on-dark-muted">실거래 신고분(취소 제외)</div>
          </div>
          <div>
            <div className="t-section t-num text-on-dark"><Num n={coverage.complexCount} /></div>
            <div className="t-caption text-on-dark-muted">실거래 있는 단지</div>
          </div>
          <div>
            <div className="t-section t-num text-on-dark"><CountUp value={toolCount} /></div>
            <div className="t-caption text-on-dark-muted">분석 도구(실데이터)</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 t-caption text-on-dark-muted">
          <span className="inline-flex items-center gap-1">
            <Icon name="lock" size={12} className="text-on-dark" /> 단지 분석 월 한도
          </span>
          <span>
            무료 <b className="text-on-dark">{quota.free}회</b>
          </span>
          <span>
            플러스 <b className="text-on-dark">{quota.plus}회</b>
          </span>
          <span>
            프로 <b className="text-on-dark">{quota.pro === null ? "무제한" : `${quota.pro}회`}</b>
          </span>
          <Link href="/subscription" className="font-bold text-brand-red-dark no-underline">
            플랜 보기 ›
          </Link>
        </div>
      </div>
    </section>
  );
}
