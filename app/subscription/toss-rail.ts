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
  };
  widgets: (opts: { customerKey: string }) => TossWidgets;
}) & { ANONYMOUS: string };

declare global {
  interface Window {
    TossPayments?: TossPaymentsFn;
  }
}

/** 빌드 시 인라인되는 공개 클라이언트 키. 미설정이면 이 레일 자체가 비활성. */
export function tossClientKey(): string | null {
  const k = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim();
  return k && (k.startsWith("test_ck_") || k.startsWith("live_ck_")) ? k : null;
}

/** 테스트 키 여부 — 화면에 "실제 청구 없음"을 밝히는 근거 */
export function isTossTestEnv(): boolean {
  return tossClientKey()?.startsWith("test_ck_") ?? false;
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
