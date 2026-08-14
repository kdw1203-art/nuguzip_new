"use client";

/**
 * 토스페이먼츠 SDK(v2) 클라이언트 헬퍼 — 키 판별 + SDK 1회 로드 + 위젯 타입.
 *
 * 실제 결제 UI 는 결제위젯 주문서형(/subscription/checkout, CheckoutClient)이
 * 담당한다. 여기는 그 페이지와 구독 버튼(PlanCheckoutButton)이 공유하는
 * 최소 공통분모만 둔다.
 *
 * 문서 근거 (docs.tosspayments.com/guides/environment · guides/v2/payment-widget):
 *  - 테스트 키(test_ck_/test_sk_) 승인은 **가상**이다 — 실제 청구 없음.
 *    화면은 반드시 "테스트 결제"임을 밝힌다(사실 우선).
 *  - 위젯은 계약 후 상점관리자 어드민에서 코드 수정 없이 결제수단·UI 를
 *    관리할 수 있고, variantKey 로 특정 UI 를 지정한다(미지정 = 기본 UI).
 *  - 카카오페이 간편결제는 토스 테스트 환경 미지원(라이브 키 필요).
 */

const SDK_SRC = "https://js.tosspayments.com/v2/standard";

/** 결제위젯 인스턴스 — 주문서형(renderPaymentMethods+renderAgreement) 연동용 */
export type TossWidgets = {
  setAmount: (amount: { currency: "KRW"; value: number }) => Promise<void>;
  renderPaymentMethods: (opts: {
    selector: string;
    variantKey?: string;
  }) => Promise<unknown>;
  renderAgreement: (opts: { selector: string; variantKey?: string }) => Promise<unknown>;
  requestPayment: (opts: Record<string, unknown>) => Promise<void>;
};

export type TossPaymentsFn = ((clientKey: string) => {
  payment: (opts: { customerKey: string }) => {
    requestPayment: (opts: Record<string, unknown>) => Promise<void>;
    /** 자동결제(빌링) 카드 등록창 — successUrl 로 customerKey+authKey 리다이렉트.
     *  빌링 문서: customerKey 는 서버 발급 무작위 고유값(이메일 등 유추 가능 값 금지). */
    requestBillingAuth: (opts: {
      method: "CARD";
      successUrl: string;
      failUrl: string;
      customerEmail?: string;
      customerName?: string;
    }) => Promise<void>;
  };
  widgets: (opts: { customerKey: string }) => TossWidgets;
}) & { ANONYMOUS: string };

declare global {
  interface Window {
    TossPayments?: TossPaymentsFn;
  }
}

/** 빌드 시 인라인되는 공개 클라이언트 키. 미설정이면 이 레일 자체가 비활성.
 *  결제위젯 연동 키(gck)와 API 개별 연동 키(ck)를 모두 받는다 — 어느 쪽이냐에
 *  따라 쓸 수 있는 SDK 제품이 다르다(isWidgetKey 참고). */
export function tossClientKey(): string | null {
  const k = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim();
  return k &&
    (k.startsWith("test_ck_") ||
      k.startsWith("live_ck_") ||
      k.startsWith("test_gck_") ||
      k.startsWith("live_gck_"))
    ? k
    : null;
}

/**
 * 결제위젯 연동 키인가.
 *
 * API 키 문서: 클라이언트 키와 시크릿 키는 세트고, **결제위젯 SDK(widgets)는
 * 위젯 연동 키(gck), 결제창 SDK(payment)는 API 개별 키(ck)**를 써야 한다.
 * ck 키로 widgets() 를 부르면 INVALID_CLIENT_KEY 로 위젯이 그려지지 않는다 —
 * 키 종류를 보고 주문서형(위젯)과 결제창형 중 맞는 흐름을 고른다.
 */
export function isWidgetKey(): boolean {
  const k = tossClientKey();
  return Boolean(k && (k.startsWith("test_gck_") || k.startsWith("live_gck_")));
}

/** 테스트 키 여부 — 화면에 "실제 청구 없음"을 밝히는 근거.
 *  ck/gck 어느 종류든 test_ 접두사면 테스트 환경이다. */
export function isTossTestEnv(): boolean {
  return tossClientKey()?.startsWith("test_") ?? false;
}

let sdkPromise: Promise<TossPaymentsFn> | null = null;

/** SDK 1회 로드 — 이미 script 가 있으면 재사용, 로드 실패는 reject */
export function loadTossSdk(): Promise<TossPaymentsFn> {
  if (window.TossPayments) return Promise.resolve(window.TossPayments);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<TossPaymentsFn>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => {
      if (window.TossPayments) resolve(window.TossPayments);
      else reject(new Error("TossPayments SDK 로드 후에도 전역 객체가 없습니다"));
    };
    script.onerror = () => {
      sdkPromise = null; // 다음 시도에서 다시 로드
      reject(new Error("TossPayments SDK 스크립트를 불러오지 못했습니다"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}
