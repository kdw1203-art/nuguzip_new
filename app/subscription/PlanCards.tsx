"use client";

import { useState } from "react";
import Link from "next/link";
import { PlanCheckoutButton, type CheckoutTier } from "./PlanCheckoutButton";

/* 구독 플랜 카드 3종 + 월간/연간 토글 (item 13, 클라이언트 상호작용)
   가격은 서버(page.tsx)에서 billing-periods 단일 출처로 주입 — 하드코딩 없음. */

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
  name: string;
  nameTone: string;
  dark: boolean;
  features: { ok: boolean; text: string }[];
  badge: string | null;
  checkoutTier: CheckoutTier | null;
  cta: string;
  ctaClass: string;
};

const CARDS: PlanCard[] = [
  {
    kind: "free",
    name: "무료",
    nameTone: "text-ink",
    dark: false,
    features: [
      { ok: true, text: "임장노트 무제한 작성" },
      { ok: true, text: "지도 · 실거래가 조회" },
      { ok: true, text: "AI 요약 월 3회" },
      { ok: false, text: "단지 비교 리포트" },
    ],
    badge: null,
    checkoutTier: null,
    cta: "무료로 시작",
    ctaClass: "bg-[#f2f4f8] text-text-1",
  },
  {
    kind: "pro",
    name: "플러스",
    nameTone: "text-[#7ea2ff]",
    dark: true,
    features: [
      { ok: true, text: "무료 기능 전부" },
      { ok: true, text: "AI 요약 · 비교 리포트 무제한" },
      { ok: true, text: "금리·시세 리스크 알림" },
      { ok: true, text: "노트 PDF 내보내기" },
    ],
    badge: "가장 인기",
    checkoutTier: "pro",
    cta: "14일 무료 체험",
    ctaClass: "btn-primary btn-cta",
  },
  {
    kind: "expert",
    name: "프로 (전문가)",
    nameTone: "text-[#c07a3a]",
    dark: false,
    features: [
      { ok: true, text: "플러스 기능 전부" },
      { ok: true, text: "리포트 발행 · 판매 (수수료 15%)" },
      { ok: true, text: "전문가 배지 · 상담 수신" },
      { ok: true, text: "지역 통계 대시보드" },
    ],
    badge: null,
    checkoutTier: "expert",
    cta: "전문가로 시작",
    ctaClass: "border-[1.5px] border-ink bg-surface text-ink",
  },
];

export function PlanCards({
  currentPlan,
  pro,
  expert,
}: {
  currentPlan: PlanKind;
  pro: TierPricing;
  expert: TierPricing;
}) {
  const [billing, setBilling] = useState<Billing>("monthly");
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

              <div className={`text-[15px] font-extrabold ${p.nameTone}`}>{p.name}</div>

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

              <div
                className={`flex flex-col gap-[9px] text-[13px] leading-[1.5] ${
                  p.dark ? "text-ai-text" : "text-text-1"
                }`}
              >
                {p.features.map((f) => (
                  <div key={f.text} className={`flex gap-2 ${f.ok ? "" : "text-[#adb5bd]"}`}>
                    <span className={f.ok ? `font-extrabold ${p.dark ? "text-[#7ea2ff]" : "text-primary"}` : ""}>
                      {f.ok ? "✓" : "—"}
                    </span>
                    {f.text}
                  </div>
                ))}
              </div>

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
                  <PlanCheckoutButton
                    tier={p.checkoutTier}
                    billing={billing}
                    label={p.cta}
                    className={p.ctaClass}
                  />
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
