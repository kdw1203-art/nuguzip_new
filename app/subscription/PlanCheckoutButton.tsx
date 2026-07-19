"use client";

import { useState } from "react";

/**
 * 구독 플랜 결제 시작 버튼.
 * 새 디자인 플랜 → 구 결제 코드(membership plan tier) 매핑:
 *   플러스 → "pro" (PRO) · 프로(전문가) → "expert" (EXPERT)
 *
 * 절대 규칙: 결제를 완료시키지 않는다 — 결제 생성 API 호출 후
 * 응답의 결제창 URL로 이동하는 것까지만 연결한다. (승인·확정은 결제창에서 사용자가 진행)
 */
export type CheckoutTier = "pro" | "expert";

export function PlanCheckoutButton({
  tier,
  label,
  className,
}: {
  tier: CheckoutTier;
  label: string;
  className: string;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function startCheckout() {
    if (busy) return;
    setNotice(null);

    // 1) 로그인 확인 — 비로그인 시 로그인 페이지로 (callbackUrl 유지)
    let authed = false;
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as
        | { user?: { email?: string | null } }
        | null;
      authed = Boolean(j?.user?.email);
    } catch {
      authed = false;
    }
    if (!authed) {
      window.location.href = `/login?callbackUrl=${encodeURIComponent("/subscription")}`;
      return;
    }

    // 2) 확인 문구 후 결제 생성 API 호출 → 결제창 URL로 이동
    if (!window.confirm("결제창으로 이동합니다")) return;

    setBusy(true);
    try {
      // 1순위: Stripe Checkout (구 /api/billing/checkout — { url } 반환)
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: tier, source: "subscription", campaign: "newui" }),
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && j.url) {
        window.location.href = j.url;
        return;
      }

      // 2순위: 카카오페이 (구 /api/payments/kakaopay/ready — 결제창 redirect URL 반환)
      const kp = await fetch("/api/payments/kakaopay/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          billing: "monthly",
          source: "subscription",
          campaign: "newui-kakaopay",
        }),
      });
      const kj = (await kp.json().catch(() => ({}))) as {
        nextRedirectPcUrl?: string | null;
        nextRedirectMobileUrl?: string | null;
        error?: string;
      };
      const isMobile =
        typeof navigator !== "undefined" &&
        /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
      const payUrl =
        (isMobile ? kj.nextRedirectMobileUrl : kj.nextRedirectPcUrl) ??
        kj.nextRedirectPcUrl ??
        kj.nextRedirectMobileUrl;
      if (kp.ok && payUrl) {
        window.location.href = payUrl;
        return;
      }

      setNotice("결제 준비 중입니다. 잠시 후 다시 시도해 주세요.");
    } catch {
      setNotice("결제 준비 중입니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => void startCheckout()}
        className={`rounded-[14px] p-[13px] text-center text-sm font-bold disabled:opacity-60 ${className}`}
      >
        {busy ? "연결 중…" : label}
      </button>
      {notice && (
        <p role="alert" className="text-center text-[11px] font-bold text-danger">
          {notice}
        </p>
      )}
    </div>
  );
}
