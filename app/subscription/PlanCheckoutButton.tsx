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
  billing = "monthly",
}: {
  tier: CheckoutTier;
  label: string;
  className: string;
  billing?: "monthly" | "annual";
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * 결제창 이동 전 한 번 더 묻는 단계. 예전에는 `window.confirm` 을 썼는데,
   * 브라우저 모달은 페이지 이벤트를 통째로 막고(자동화·접근성 도구 포함) 문구를
   * 다듬을 수도 없다. 버튼 자리에서 바로 확인받는 2단계 방식으로 바꾼다.
   */
  const [confirming, setConfirming] = useState(false);

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

    // 2) 결제 생성 API 호출 → 결제창 URL로 이동 (확인은 버튼 자리에서 이미 받았다)
    //    실패했을 때 "결제 준비 중입니다" 하나로 뭉개지 않는다 — Stripe 미설정(503)·
    //    카카오페이 실패·네트워크 단절은 사용자가 취할 다음 행동이 서로 다르다.
    setConfirming(false);
    setBusy(true);

    type Failure = { kind: "unavailable" | "error" | "network"; message?: string };

    /* 카드(Stripe) 레일 — { url } 반환. 503 은 고지 미완·연간 미등록 등 서버 문구. */
    const tryStripe = async (): Promise<Failure | null> => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: tier, billing, source: "subscription", campaign: "newui" }),
        });
        const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (res.ok && j.url) {
          window.location.href = j.url;
          return null;
        }
        return res.status === 503
          ? { kind: "unavailable", message: j.error }
          : { kind: "error" };
      } catch {
        return { kind: "network" };
      }
    };

    /* 카카오페이 레일 — 결제창 redirect URL 반환. */
    const tryKakao = async (): Promise<Failure | null> => {
      try {
        const kp = await fetch("/api/payments/kakaopay/ready", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tier,
            billing,
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
          return null;
        }
        return kp.status === 503 ? { kind: "unavailable" } : { kind: "error" };
      } catch {
        return { kind: "network" };
      }
    };

    try {
      /* 레일 순서(항목 32): 연간은 카카오페이 먼저. 연간 카드 상품
         (STRIPE_PRICE_*_ANNUAL)이 등록되지 않은 동안 Stripe 는 연간 요청을
         503 으로 거절하는데, 카카오페이는 연간 금액(약 20% 할인)을 정상
         계산한다 — LTV 가 가장 높은 코호트가 동작하는 경로를 시도하기도 전에
         거절 문구부터 보게 둘 이유가 없다. 월간은 기존대로 카드 먼저. */
      const kakaoFirst = billing === "annual";
      const first = kakaoFirst ? tryKakao : tryStripe;
      const second = kakaoFirst ? tryStripe : tryKakao;

      const firstFailure = await first();
      if (firstFailure === null) return; // 결제창으로 이동함
      const secondFailure = await second();
      if (secondFailure === null) return;

      const stripeFailure = kakaoFirst ? secondFailure : firstFailure;
      const kakaoFailure = kakaoFirst ? firstFailure : secondFailure;

      // 두 수단 모두 실패 — 원인별로 다른 안내
      if (stripeFailure.kind === "network" && kakaoFailure.kind === "network") {
        setNotice("네트워크 연결이 불안정해요. 연결을 확인한 뒤 다시 시도해 주세요.");
      } else if (stripeFailure.kind === "unavailable" && kakaoFailure.kind === "unavailable") {
        setNotice(
          "지금은 카드·카카오페이 결제를 모두 사용할 수 없어요. 잠시 후 다시 시도하거나 고객센터로 문의해 주세요.",
        );
      } else if (kakaoFailure.kind === "network") {
        setNotice("네트워크 연결이 불안정해요. 연결을 확인한 뒤 다시 시도해 주세요.");
      } else if (stripeFailure.kind === "unavailable") {
        // 카드 결제가 막힌 이유(연간 미등록 등)를 알려주고, 카카오페이 실패도 함께 안내
        setNotice(
          `${stripeFailure.message ?? "카드 결제가 아직 준비되지 않았어요."} 카카오페이 연결도 실패해 결제를 시작하지 못했어요.`,
        );
      } else if (kakaoFailure.kind === "unavailable") {
        setNotice(
          "카드 결제에 실패했고 카카오페이는 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.",
        );
      } else {
        setNotice("결제 시작에 실패했어요. 잠시 후 다시 시도해 주세요. 반복되면 고객센터로 문의해 주세요.");
      }
    } finally {
      setBusy(false);
    }
  }

  const billingLabel = billing === "annual" ? "연간" : "월간";

  return (
    <div className="flex flex-col gap-1.5">
      {confirming && !busy ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-center text-[11px] font-bold text-text-2">
            {billingLabel} 결제창으로 이동합니다
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-[14px] border border-line bg-surface p-[13px] text-center text-sm font-bold text-text-1"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void startCheckout()}
              className={`flex-1 rounded-[14px] p-[13px] text-center text-sm font-bold ${className}`}
            >
              계속
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setNotice(null);
            setConfirming(true);
          }}
          className={`rounded-[14px] p-[13px] text-center text-sm font-bold disabled:opacity-60 ${className}`}
        >
          {busy ? "연결 중…" : label}
        </button>
      )}
      {notice && (
        <p role="alert" className="text-center text-[11px] font-bold text-danger">
          {notice}
        </p>
      )}
    </div>
  );
}
