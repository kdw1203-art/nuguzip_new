import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { getPaymentByOrderId, markFailed } from "@/lib/payments/store";

export const metadata: Metadata = {
  title: "결제 실패 | 누구집",
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

type FailCategory =
  | "user_cancel"
  | "limit_exceeded"
  | "card_rejected"
  | "invalid_card"
  | "network"
  | "not_configured"
  | "forbidden"
  | "amount_mismatch"
  | "unknown";

const CATEGORY_MESSAGE: Record<FailCategory, string> = {
  user_cancel: "결제를 취소하셨어요. 마음이 바뀌면 언제든 다시 시도할 수 있어요.",
  limit_exceeded:
    "카드 한도 초과 또는 잔액 부족으로 결제되지 않았어요. 한도를 확인하거나 다른 카드로 시도해 주세요.",
  card_rejected:
    "카드사에서 결제를 거절했어요. 카드사에 사유를 확인하거나 다른 결제 수단으로 시도해 주세요.",
  invalid_card:
    "카드 정보에 문제가 있어요. 유효기간·정지 여부를 확인하거나 다른 카드로 시도해 주세요.",
  network:
    "네트워크 문제로 결제가 중단됐어요. 연결 상태를 확인한 뒤 잠시 후 다시 시도해 주세요.",
  not_configured:
    "지금은 이 결제 수단을 사용할 수 없어요. 잠시 후 다시 시도하거나 고객센터로 문의해 주세요.",
  forbidden: "본인 계정에서 시작한 결제만 완료할 수 있어요. 로그인 상태를 확인해 주세요.",
  amount_mismatch:
    "결제 금액 확인 과정에서 문제가 발견되어 안전을 위해 결제를 중단했어요. 처음부터 다시 시도해 주세요.",
  unknown: "결제가 완료되지 않았어요. 잠시 후 다시 시도해 주세요. 반복되면 고객센터로 문의해 주세요.",
};

/** 알려진 PG 오류 코드(토스·카카오페이) + 내부 reason → 카테고리 */
const KNOWN_CODES: Record<string, FailCategory> = {
  // 사용자 취소
  PAY_PROCESS_CANCELED: "user_cancel",
  USER_CANCEL: "user_cancel",
  CANCEL: "user_cancel",
  // 한도·잔액
  NOT_ENOUGH_BALANCE: "limit_exceeded",
  EXCEED_MAX_AMOUNT: "limit_exceeded",
  EXCEED_MAX_PAYMENT_AMOUNT: "limit_exceeded",
  EXCEED_MAX_DAILY_PAYMENT_COUNT: "limit_exceeded",
  EXCEED_MAX_ONE_DAY_AMOUNT: "limit_exceeded",
  // 카드사 거절
  REJECT_CARD_COMPANY: "card_rejected",
  REJECT_CARD_PAYMENT: "card_rejected",
  RESTRICTED_TRANSFER_ACCOUNT: "card_rejected",
  // 카드 정보 문제
  INVALID_CARD_NUMBER: "invalid_card",
  INVALID_CARD_EXPIRATION: "invalid_card",
  INVALID_STOPPED_CARD: "invalid_card",
  INVALID_CARD_INSTALLMENT_PLAN: "invalid_card",
  // 일시 오류·네트워크
  PAY_PROCESS_ABORTED: "network",
  PROVIDER_ERROR: "network",
  FAILED_INTERNAL_SYSTEM_PROCESSING: "network",
  UNKNOWN_PAYMENT_ERROR: "network",
  // 내부 reason (kakaopay 콜백 라우트 등)
  MISSING_PARAMS: "not_configured",
  NOT_CONFIGURED: "not_configured",
  FORBIDDEN: "forbidden",
  DUPLICATE_TID: "amount_mismatch",
  AMOUNT_MISMATCH: "amount_mismatch",
};

function categorize(sp: { code?: string; reason?: string; checkout?: string }): FailCategory {
  // Stripe Checkout 취소 리턴(cancelUrl)은 코드 없이 checkout=cancel 로 온다
  if (sp.checkout === "cancel") return "user_cancel";
  for (const raw of [sp.code, sp.reason]) {
    const key = raw?.trim().toUpperCase().replace(/-/g, "_");
    if (key && KNOWN_CODES[key]) return KNOWN_CODES[key];
  }
  return "unknown";
}

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
    sp.billing === "annual" || sp.billing === "monthly" ? sp.billing : null;

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
          className={`flex h-16 w-16 items-center justify-center rounded-full text-[30px] text-white shadow-[0_10px_28px_rgba(16,28,54,.18)] ${
            category === "user_cancel" ? "bg-[#8a94a6]" : "bg-danger"
          }`}
        >
          {category === "user_cancel" ? "−" : "!"}
        </span>
        <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-ink">
          {category === "user_cancel" ? "결제를 취소했습니다" : "결제가 완료되지 않았습니다"}
        </h1>
        <p className="text-sm leading-[1.6] text-text-2">{CATEGORY_MESSAGE[category]}</p>
        {(orderIdShown || codeShown) && (
          <p className="text-xs text-text-3">
            {orderIdShown ? `주문번호 ${orderIdShown}` : null}
            {orderIdShown && codeShown ? " · " : null}
            {codeShown ? `코드 ${codeShown}` : null}
          </p>
        )}
        <div className="mt-3 flex w-full flex-col gap-2.5">
          <Link
            href={retryHref}
            className="btn-primary rounded-[14px] p-[13px] text-center text-sm font-bold"
          >
            다시 시도하기
          </Link>
          <Link
            href="/support"
            className="rounded-[14px] border border-line bg-surface p-[13px] text-center text-sm font-bold text-text-1"
          >
            문의하기
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
