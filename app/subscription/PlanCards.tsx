"use client";

import { useState } from "react";
import Link from "next/link";
import { PlanCheckoutButton, type CheckoutTier } from "./PlanCheckoutButton";
import { PreOrderCta } from "./PreOrderCta";
import { getPlan, type PlanFeature } from "@/lib/subscriptions/plans";

/* 구독 플랜 카드 3종 + 월간/연간 토글 (item 13, 클라이언트 상호작용)
   가격은 서버(page.tsx)에서 billing-periods 단일 출처로 주입 — 하드코딩 없음.

   기능 목록도 단일 출처(lib/subscriptions/plans PLAN_DEFINITIONS)에서 온다.
   예전에는 여기 축약 사본 4줄이 따로 있었는데, 실제 한도(access.ts)와 숫자가
   어긋나기 시작했다 — 한도는 결제 근거라 사본이 생기면 반드시 거짓이 된다.
   tagline·전체 기능·한도 표기를 그대로 그려 "기능 설명"을 카드에서 끝낸다. */

export type TierPricing = {
  monthly: number;
  annualMonthly: number;
  annualTotal: number;
  annualDiscountPct: number;
};

type Billing = "monthly" | "annual";
type PlanKind = "free" | "pro" | "expert";

const fmtWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;

type PlanCard = {
  kind: PlanKind;
  /** 단일 출처(PLAN_DEFINITIONS) 조회용 내부 tier */
  defTier: "basic" | "pro" | "expert";
  name: string;
  nameTone: string;
  dark: boolean;
  badge: string | null;
  checkoutTier: CheckoutTier | null;
  cta: string;
  ctaClass: string;
};

/* 표시명·톤·CTA 만 여기서 정하고, tagline·기능·한도는 PLAN_DEFINITIONS 가 준다.
   (예전 "14일 무료 체험" 같은 없는 혜택 문구 사고의 재발 방지 — 혜택 문장은
   전부 단일 출처를 거친다.) */
const CARDS: PlanCard[] = [
  {
    kind: "free",
    defTier: "basic",
    name: "무료",
    nameTone: "text-ink",
    dark: false,
    badge: null,
    checkoutTier: null,
    cta: "무료로 시작",
    ctaClass: "bg-[#f2f4f8] text-text-1",
  },
  {
    kind: "pro",
    defTier: "pro",
    name: "플러스",
    nameTone: "text-[#7ea2ff]",
    dark: true,
    badge: "가장 인기",
    checkoutTier: "pro",
    cta: "플러스 시작하기",
    ctaClass: "btn-primary btn-cta",
  },
  {
    kind: "expert",
    defTier: "expert",
    name: "프로 (전문가)",
    nameTone: "text-warning",
    dark: false,
    badge: null,
    checkoutTier: "expert",
    cta: "전문가로 시작",
    ctaClass: "border-[1.5px] border-ink bg-surface text-ink",
  },
];

/** 기능 한 줄 — ✓(제공) / ✓+한도(부분) / —(미포함·잠금) */
/* 모바일18 — 모바일 상위 5줄 + 토글, md+ 전체. 접힌 항목은 md+ 에서 CSS 로
   항상 보이므로 토글 상태는 모바일에만 영향을 준다. */
function FeatureList({ features, dark }: { features: PlanFeature[]; dark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const VISIBLE = 5;
  const hidden = features.length - VISIBLE;
  return (
    <div
      className={`flex flex-col divide-y text-[13px] leading-[1.5] ${
        dark ? "divide-white/[.06] text-ai-text" : "divide-[#f0f3f8] text-text-1"
      }`}
    >
      {features.map((f, i) => (
        <div
          key={f.label}
          className={i >= VISIBLE && !expanded ? "hidden md:block" : undefined}
        >
          <FeatureRow f={f} dark={dark} />
        </div>
      ))}
      {hidden > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`py-2 text-left text-[12px] font-bold md:hidden ${
            dark ? "text-ai-muted" : "text-primary"
          }`}
        >
          전체 기능 {features.length}개 보기 ▾
        </button>
      )}
    </div>
  );
}

function FeatureRow({ f, dark }: { f: PlanFeature; dark: boolean }) {
  const off = f.included === false;
  return (
    <div
      className={`flex items-start justify-between gap-2 py-[5px] ${
        off ? (dark ? "text-white/35" : "text-text-3") : ""
      }`}
    >
      <span className="flex min-w-0 gap-2">
        <span
          aria-hidden
          className={
            off
              ? ""
              : `font-extrabold ${dark ? "text-[#7ea2ff]" : "text-primary"}`
          }
        >
          {off ? "—" : "✓"}
        </span>
        <span className="min-w-0">{f.label}</span>
      </span>
      {f.note && !off && (
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
            dark ? "bg-white/10 text-[#9db9ff]" : "bg-primary-soft text-primary"
          }`}
        >
          {f.note}
        </span>
      )}
    </div>
  );
}

export function PlanCards({
  currentPlan,
  pro,
  expert,
  initialBilling = "monthly",
  paymentsReady = true,
}: {
  currentPlan: PlanKind;
  pro: TierPricing;
  expert: TierPricing;
  /** 결제 실패 후 재시도 등 — 서버가 쿼리로 넘긴 초기 결제 주기 */
  initialBilling?: Billing;
  /** 서버 판정(항목 33): 사업자 고지 완료 + PSP 설정 여부. false 면 결제
      버튼 대신 사전 등록(오픈 알림)을 그린다 — 눌러 보기 전엔 알 수 없는
      실패 문구보다 사실을 먼저 말하는 쪽이 맞다. */
  paymentsReady?: boolean;
}) {
  const [billing, setBilling] = useState<Billing>(initialBilling);
  const pricing: Record<"pro" | "expert", TierPricing> = { pro, expert };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* 월간 / 연간 토글 */}
      <div className="rise-in inline-flex gap-1 rounded-full border border-line bg-surface p-1 text-[13px]">
        {(["monthly", "annual"] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBilling(b)}
            className={`rounded-full px-4 py-1.5 font-bold transition-colors ${
              billing === b ? "bg-ink text-white" : "text-text-3"
            }`}
          >
            {b === "monthly" ? "월간" : `연간 최대 -${Math.round(Math.max(pro.annualDiscountPct, expert.annualDiscountPct))}%`}
          </button>
        ))}
      </div>

      <div className="grid w-full max-w-[1080px] gap-5 md:grid-cols-3">
        {CARDS.map((p, i) => {
          const def = getPlan(p.defTier);
          const isCurrent = currentPlan === p.kind;
          const tierPrice = p.checkoutTier ? pricing[p.checkoutTier] : null;
          const monthlyShown =
            tierPrice == null
              ? 0
              : billing === "annual"
                ? tierPrice.annualMonthly
                : tierPrice.monthly;

          return (
            <div
              key={p.kind}
              className={`rise-in-${i + 1} relative flex flex-col gap-4 rounded-3xl p-7 ${
                p.dark
                  ? "bg-[rgba(25,31,40,.96)] shadow-[0_24px_60px_rgba(16,28,54,.28)] md:-translate-y-2"
                  : "card"
              } ${isCurrent ? "ring-2 ring-primary" : ""}`}
            >
              {isCurrent ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3.5 py-[5px] text-[11px] font-extrabold text-[#7ea2ff]">
                  현재 이용 중
                </span>
              ) : (
                p.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3.5 py-[5px] text-[11px] font-extrabold text-white shadow-[0_6px_16px_rgba(29,79,216,.4)]">
                    {p.badge}
                  </span>
                )
              )}

              <div className="flex flex-col gap-1">
                <div className={`text-[15px] font-extrabold ${p.nameTone}`}>{p.name}</div>
                {/* 단일 출처 tagline — "누구를 위한 플랜인가" 한 줄 */}
                <div className={`text-[12px] ${p.dark ? "text-ai-muted" : "text-text-3"}`}>
                  {def.tagline}
                </div>
              </div>

              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-[32px] font-extrabold ${p.dark ? "text-white" : "text-ink"}`}>
                    {tierPrice == null ? "0원" : fmtWon(monthlyShown)}
                  </span>
                  {tierPrice != null && (
                    <span className={`text-[13px] ${p.dark ? "text-ai-muted" : "text-text-3"}`}>/월</span>
                  )}
                </div>
                {tierPrice != null && billing === "annual" && (
                  <span className={`text-[11px] ${p.dark ? "text-ai-muted" : "text-text-3"}`}>
                    연 {fmtWon(tierPrice.annualTotal)} · -{Math.round(tierPrice.annualDiscountPct)}%
                  </span>
                )}
              </div>

              {/* 모바일18 — 기능 7~11줄이 모바일에서 카드를 길게 만든다.
                  모바일은 상위 5줄 + "전체 N개 보기" 토글, md+ 는 전체 노출.
                  숨긴 개수를 버튼에 적는다(몇 개가 접혔는지 모르게 하지 않는다). */}
              <FeatureList features={def.features} dark={p.dark} />


              <div className="flex-1" />

              {isCurrent ? (
                <button
                  type="button"
                  disabled
                  className="rounded-[14px] bg-[#f2f4f8] p-[13px] text-center text-sm font-bold text-text-1 opacity-70"
                >
                  현재 이용 중
                </button>
              ) : p.checkoutTier ? (
                <>
                  {paymentsReady ? (
                    <PlanCheckoutButton
                      tier={p.checkoutTier}
                      billing={billing}
                      label={p.cta}
                      className={p.ctaClass}
                    />
                  ) : (
                    <PreOrderCta
                      tier={p.checkoutTier}
                      billing={billing}
                      className={p.ctaClass}
                      dark={p.dark}
                    />
                  )}
                  <Link
                    href="/points/shop"
                    className={`text-center text-[11px] font-bold no-underline ${
                      p.dark ? "text-[#7ea2ff]" : "text-primary"
                    }`}
                  >
                    포인트로 교환하기 ›
                  </Link>
                </>
              ) : (
                <Link
                  href="/notes/new"
                  className={`rounded-[14px] p-[13px] text-center text-sm font-bold no-underline ${p.ctaClass}`}
                >
                  {p.cta}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
