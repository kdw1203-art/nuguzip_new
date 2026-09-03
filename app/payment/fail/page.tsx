import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { getPaymentByOrderId, markFailed } from "@/lib/payments/store";

export const metadata: Metadata = {
  title: "결제 실패 | 내집나우",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * 결제 실패·취소 리턴 페이지. (구 app/payment/fail 포트)
 *
 * 하드닝: PG가 리다이렉트로 넘긴 `message` 를 화면에 그대로 찍지 않는다 —
 * 쿼리스트링은 누구나 조작할 수 있어서 임의 문구를 우리 UI 말풍선에 넣는
 * 반사형 문구 주입 통로가 된다. 대신 알려진 오류 코드만 우리가 쓴 한국어
 * 안내로 매핑하고, 모르는 값은 일반 문구로 뭉갠다. 코드 표기도 안전한
 * 문자([A-Za-z0-9_-])만 통과시킨다.
 */

import {
  categorizeFailure as categorize,
  CATEGORY_ACTION,
  CATEGORY_MESSAGE,
} from "@/lib/payments/fail-categories";

/** 화면에 그대로 노출해도 되는 안전한 토큰만 통과 (그 외는 표기 생략) */
function safeToken(v: string | undefined, max = 40): string | null {
  const s = v?.trim() ?? "";
  return /^[A-Za-z0-9_-]+$/.test(s) && s.length <= max ? s : null;
}

export default async function PaymentFailPage({
  searchParams,
}: {
  searchParams: Promise<{
    orderId?: string;
    code?: string;
    message?: string;
    reason?: string;
    provider?: string;
    checkout?: string;
    plan?: string;
    billing?: string;
  }>;
}) {
  const sp = await searchParams;

  // 재시도 링크에 보존할 plan/billing — 쿼리 화이트리스트가 1순위,
  // 없으면 주문 기록(orderId)에서 복원한다 (카카오페이 콜백은 orderId 만 넘긴다).
  let retryPlan = sp.plan === "pro" || sp.plan === "expert" ? sp.plan : null;
  let retryBilling =
    sp.billing === "annual" || sp.billing === "monthly" || sp.billing === "weekly"
      ? sp.billing
      : null;

  if (sp.orderId) {
    try {
      const payment = await getPaymentByOrderId(sp.orderId);
      if (payment) {
        if (!retryPlan && (payment.plan === "pro" || payment.plan === "expert")) {
          retryPlan = payment.plan;
        }
        if (!retryBilling) retryBilling = payment.billing;
      }
      await markFailed(sp.orderId);
    } catch {
      /* 기록 실패는 무시 — 안내는 그대로 노출 */
    }
  }

  const retryQuery = new URLSearchParams();
  if (retryPlan) retryQuery.set("plan", retryPlan);
  if (retryBilling) retryQuery.set("billing", retryBilling);
  const retryHref = retryQuery.size > 0 ? `/subscription?${retryQuery}` : "/subscription";

  const category = categorize(sp);
  const orderIdShown = safeToken(sp.orderId, 64);
  const codeShown = safeToken(sp.code);

  return (
    <PageShell breadcrumb="구독 · 결제 결과">
      <section className="rise-in mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 pt-10 text-center">
        {/* 이모지 대신 상태 배지 — 성공 화면과 짝을 이루는 시각 언어.
            취소는 중립(회색), 실패는 경고색으로 구분한다. 취소한 사람에게
            경고색을 보여줄 이유가 없다 — 잘못한 게 아니다. */}
        <span
          aria-hidden
          className={`flex h-16 w-16 items-center justify-center rounded-full text-[28px] text-white shadow-[0_10px_28px_rgba(16,28,54,.18)] ${
            category === "user_cancel" ? "bg-text-3" : "bg-danger"
          }`}
        >
          {category === "user_cancel" ? "−" : "!"}
        </span>
        <h1 className="text-[21px] font-extrabold tracking-[-0.4px] text-ink">
          {category === "user_cancel" ? "결제를 취소했습니다" : "결제가 완료되지 않았습니다"}
        </h1>
        <p className="text-[13px] leading-[1.6] text-text-2">{CATEGORY_MESSAGE[category]}</p>
        {(orderIdShown || codeShown) && (
          <p className="text-xs text-text-3">
            {orderIdShown ? `주문번호 ${orderIdShown}` : null}
            {orderIdShown && codeShown ? " · " : null}
            {codeShown ? `코드 ${codeShown}` : null}
          </p>
        )}
        {/* 실패 사유마다 통하는 행동이 다르다 — 정지된 카드로 "다시 시도"를
            눌러 봐야 같은 자리에서 또 막힌다. (C45) */}
        <div className="mt-3 flex w-full flex-col gap-2.5">
          <Link
            href={
              CATEGORY_ACTION[category].kind === "support"
                ? "/support"
                : CATEGORY_ACTION[category].kind === "plans"
                  ? "/subscription"
                  : retryHref
            }
            className="btn-primary rounded-[14px] p-[13px] text-center text-[15px] font-bold"
          >
            {CATEGORY_ACTION[category].label}
          </Link>
          <Link
            href="/support"
            className="rounded-[14px] border border-line bg-surface p-[13px] text-center text-[15px] font-bold text-text-1"
          >
            문의하기
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
