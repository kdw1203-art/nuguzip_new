import "server-only";

/**
 * 토스페이(Apps-in-Toss) 파트너 결제 API 클라이언트.
 *
 * 문서: https://developers-apps-in-toss.toss.im/tosspay/develop.md
 * BaseURL: https://pay-apps-in-toss-api.toss.im
 *
 * 흐름: make-payment(payToken 발급) → SDK checkoutPayment(인증) → execute-payment(승인)
 *       → refund-payment / get-payment-status
 *
 * 인증: 각 요청에 토스 로그인으로 얻은 `x-toss-user-key` 가 필요합니다.
 *       파트너 apiKey 는 `Authorization: Bearer` 로 전달합니다(키 발급 후 헤더 형식이 다르면 조정).
 *
 * 환경변수:
 *  - TOSSPAY_API_KEY        파트너 apiKey
 *  - TOSSPAY_API_URL        (선택) BaseURL 오버라이드
 *  - TOSSPAY_LIVE=1         라이브 결제(미설정 시 샌드박스: isTestPayment=true)
 *  - TOSSPAY_TEST_USER_KEY  (선택) 샌드박스에서 사용할 기본 x-toss-user-key
 */

const BASE_URL =
  process.env.TOSSPAY_API_URL?.trim().replace(/\/$/, "") ||
  "https://pay-apps-in-toss-api.toss.im";

export function isTossPayConfigured(): boolean {
  return Boolean(process.env.TOSSPAY_API_KEY?.trim());
}

/** 라이브 여부. 기본은 샌드박스(test). */
export function isTossPayLive(): boolean {
  const v = process.env.TOSSPAY_LIVE?.trim().toLowerCase();
  return v === "1" || v === "true";
}

export function defaultTestUserKey(): string | undefined {
  return process.env.TOSSPAY_TEST_USER_KEY?.trim() || undefined;
}

export type TossPayApiResult<T> = {
  resultType: "SUCCESS" | "FAIL";
  success?: T | null;
  error?: { errorCode?: string; reason?: string; msg?: string; title?: string } | null;
};

function buildHeaders(userKey: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-toss-user-key": userKey,
  };
  const apiKey = process.env.TOSSPAY_API_KEY?.trim();
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  return headers;
}

async function tossPayPost<T>(
  path: string,
  userKey: string,
  body: Record<string, unknown>,
): Promise<TossPayApiResult<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: buildHeaders(userKey),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as TossPayApiResult<T> | null;
  if (!json) {
    return {
      resultType: "FAIL",
      error: { reason: `토스페이 응답 파싱 실패 (HTTP ${res.status})` },
    };
  }
  return json;
}

export type MakePaymentInput = {
  userKey: string;
  orderNo: string;
  productDesc: string;
  amount: number;
  amountTaxFree?: number;
  cashReceipt?: boolean;
  enablePayMethods?: "TOSS_MONEY" | "CARD" | null;
  isTestPayment?: boolean;
};

export type MakePaymentSuccess = { payToken: string };

export function makePayment(input: MakePaymentInput) {
  const { userKey, ...rest } = input;
  return tossPayPost<MakePaymentSuccess>(
    "/api-partner/v1/apps-in-toss/pay/make-payment",
    userKey,
    {
      orderNo: rest.orderNo,
      productDesc: rest.productDesc,
      amount: rest.amount,
      amountTaxFree: rest.amountTaxFree ?? 0,
      cashReceipt: rest.cashReceipt ?? false,
      ...(rest.enablePayMethods ? { enablePayMethods: rest.enablePayMethods } : {}),
      isTestPayment: rest.isTestPayment ?? !isTossPayLive(),
    },
  );
}

export type ExecutePaymentSuccess = {
  mode?: string;
  orderNo?: string;
  amount?: number;
  approvalTime?: string;
  stateMsg?: string;
  paidAmount?: number;
  payMethod?: string;
  payToken?: string;
  transactionId?: string;
  salesCheckLinkUrl?: string | null;
};

export function executePayment(input: {
  userKey: string;
  payToken: string;
  orderNo?: string;
  isTestPayment?: boolean;
}) {
  return tossPayPost<ExecutePaymentSuccess>(
    "/api-partner/v1/apps-in-toss/pay/execute-payment",
    input.userKey,
    {
      payToken: input.payToken,
      ...(input.orderNo ? { orderNo: input.orderNo } : {}),
      isTestPayment: input.isTestPayment ?? !isTossPayLive(),
    },
  );
}

export type RefundPaymentSuccess = {
  refundNo?: string;
  approvalTime?: string;
  refundedAmount?: number;
  payToken?: string;
  transactionId?: string;
};

export function refundPayment(input: {
  userKey: string;
  payToken: string;
  reason: string;
  isTestPayment?: boolean;
}) {
  return tossPayPost<RefundPaymentSuccess>(
    "/api-partner/v1/apps-in-toss/pay/refund-payment",
    input.userKey,
    {
      payToken: input.payToken,
      reason: input.reason,
      isTestPayment: input.isTestPayment ?? !isTossPayLive(),
    },
  );
}

export type PaymentStatusSuccess = {
  mode?: string;
  payToken?: string;
  orderNo?: string;
  payStatus?: string;
  payMethod?: string;
  amount?: number;
  paidAmount?: number;
  refundableAmount?: number;
};

export function getPaymentStatus(input: {
  userKey: string;
  payToken: string;
  orderNo: string;
  isTestPayment?: boolean;
}) {
  return tossPayPost<PaymentStatusSuccess>(
    "/api-partner/v1/apps-in-toss/pay/get-payment-status",
    input.userKey,
    {
      payToken: input.payToken,
      orderNo: input.orderNo,
      isTestPayment: input.isTestPayment ?? !isTossPayLive(),
    },
  );
}
