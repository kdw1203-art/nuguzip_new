/**
 * 토스/카카오페이 결제 실패 코드 → 사용자 안내 카테고리. **순수 함수(테스트 가능).**
 *
 * app/payment/fail/page.tsx 에서 여기로 뽑아냈다 — 코드→카테고리 매핑은
 * "이 코드가 이 안내로 간다"는 단정이라 테스트로 고정해 둘 값이다(문서의 대표
 * 실패 코드가 엉뚱한 문구로 가면 사용자가 카드 문제로 오해한다). 페이지는 이
 * 모듈을 import 해서 쓰고, tests/unit/fail-categories.test.ts 가 지킨다.
 */

export type FailCategory =
  | "user_cancel"
  | "limit_exceeded"
  | "card_rejected"
  | "invalid_card"
  | "network"
  | "not_configured"
  | "forbidden"
  | "amount_mismatch"
  | "session_expired"
  | "billing_card"
  | "unknown";

export const CATEGORY_MESSAGE: Record<FailCategory, string> = {
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
  session_expired:
    "결제 진행 시간이 10분을 넘어 결제 세션이 만료됐어요. 처음부터 다시 시도해 주세요 — 카드에서 금액이 빠져나가지 않았어요.",
  billing_card:
    "자동결제 카드 등록에 실패했어요. 카드 정보를 확인하거나 다른 카드로 다시 등록해 주세요.",
  unknown: "결제가 완료되지 않았어요. 잠시 후 다시 시도해 주세요. 반복되면 고객센터로 문의해 주세요.",
};

/** 알려진 PG 오류 코드(토스·카카오페이) + 내부 reason → 카테고리 */
export const KNOWN_CODES: Record<string, FailCategory> = {
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
  EXCEED_MAX_AUTH_COUNT: "limit_exceeded",
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
  // 승인 세션 만료 — 결제창 승인 대기 10분(코어 API 문서)
  NOT_FOUND_PAYMENT_SESSION: "session_expired",
  NOT_FOUND_PAYMENT: "session_expired",
  // 키·요청 구성 오류 — 상점 설정 문제
  UNAUTHORIZED_KEY: "not_configured",
  INVALID_API_KEY: "not_configured",
  INVALID_CLIENT_KEY: "not_configured",
  FORBIDDEN_REQUEST: "not_configured",
  INVALID_REQUEST: "not_configured",
  NOT_SUPPORTED_METHOD: "not_configured",
  // 자동결제(빌링)
  NOT_FOUND_BILLING_KEY: "billing_card",
  INVALID_BILL_KEY_REQUEST: "billing_card",
  // 내부 reason (kakaopay 콜백 라우트 등)
  MISSING_PARAMS: "not_configured",
  NOT_CONFIGURED: "not_configured",
  FORBIDDEN: "forbidden",
  DUPLICATE_TID: "amount_mismatch",
  AMOUNT_MISMATCH: "amount_mismatch",
};

/** code/reason/checkout 신호를 카테고리로. 모르는 값은 unknown 으로 뭉갠다. */
export function categorizeFailure(sp: {
  code?: string;
  reason?: string;
  checkout?: string;
}): FailCategory {
  // Stripe Checkout 취소 리턴(cancelUrl)은 코드 없이 checkout=cancel 로 온다
  if (sp.checkout === "cancel") return "user_cancel";
  for (const raw of [sp.code, sp.reason]) {
    const key = raw?.trim().toUpperCase().replace(/-/g, "_");
    if (key && KNOWN_CODES[key]) return KNOWN_CODES[key];
  }
  return "unknown";
}

/**
 * 카테고리별 **다음 행동**. (C45)
 *
 * 예전에는 어떤 실패든 화면 버튼이 "다시 시도하기 / 문의하기" 둘로 똑같았다.
 * 그런데 필요한 행동은 실패 사유마다 다르다 — 정지된 카드로 "다시 시도"를
 * 눌러 봐야 같은 자리에서 또 막힌다. 안내 문구만 다르고 행동이 같으면,
 * 사용자는 읽은 대로 하지 못한다.
 *
 * primary 는 그 상황에서 실제로 통할 가능성이 있는 행동 하나다.
 */
export type FailAction = { label: string; kind: "retry" | "card" | "support" | "plans" };

export const CATEGORY_ACTION: Record<FailCategory, FailAction> = {
  user_cancel: { label: "다시 시도하기", kind: "retry" },
  /* 한도·잔액은 같은 카드로 다시 눌러도 같은 답이다 — 카드를 바꾸게 안내한다 */
  limit_exceeded: { label: "다른 카드로 시도", kind: "card" },
  card_rejected: { label: "다른 카드로 시도", kind: "card" },
  invalid_card: { label: "다른 카드로 시도", kind: "card" },
  /* 일시 오류는 정말로 재시도가 답이다 */
  network: { label: "다시 시도하기", kind: "retry" },
  not_configured: { label: "고객센터 문의", kind: "support" },
  forbidden: { label: "로그인 확인하기", kind: "support" },
  /* 금액 검증 실패는 처음부터 — 플랜 선택으로 돌려보낸다 */
  amount_mismatch: { label: "플랜 다시 고르기", kind: "plans" },
  session_expired: { label: "플랜 다시 고르기", kind: "plans" },
  billing_card: { label: "다른 카드로 등록", kind: "card" },
  unknown: { label: "다시 시도하기", kind: "retry" },
};
