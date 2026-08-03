"use client";

/**
 * 토스페이먼츠 결제창(v2) 클라이언트 레일 — 카드/간편결제 통합결제창.
 *
 * 문서 근거 (docs.tosspayments.com/guides/environment · guides/v2/payment-window/integration):
 *  - 테스트 키(test_ck_/test_sk_)로는 결제 승인이 **가상**으로 이루어진다 —
 *    실제 결제수단에서 빠져나가는 금액이 없다. 그래서 이 레일은 테스트 키로도
 *    끝까지(결제창 → successUrl → confirm) 동작하며, 화면에는 반드시
 *    "테스트 결제"임을 밝힌다(사실 우선 — 가짜 결제를 진짜처럼 보이게 두지 않는다).
 *  - 통합결제창(method: "CARD")은 카드와 간편결제(토스페이 등)를 한 창에서 보여준다.
 *    단, 카카오페이는 토스 테스트 환경을 지원하지 않는다(라이브 키 필요) —
 *    카카오페이 레일은 기존 /api/payments/kakaopay 경로가 따로 담당한다.
 *  - successUrl 리다이렉트에 paymentKey·orderId·amount 쿼리가 붙는다. 승인은
 *    서버(/api/payments/toss/confirm)가 시크릿 키 Basic 인증으로 수행하고,
 *    금액은 서버에 저장된 주문 금액과 대조한다(위변조 방지 — confirm 라우트).
 *
 * 서버 흐름은 기존 것을 그대로 쓴다:
 *   POST /api/payments/toss/create → { orderId, amount }
 *   → payment.requestPayment(결제창) → /payment/success?paymentKey&orderId&amount
 *   → 서버가 /api/payments/toss/confirm 호출(멱등키·금액 검증 포함)
 */

const SDK_SRC = "https://js.tosspayments.com/v2/standard";

type TossPaymentsFn = ((clientKey: string) => {
  payment: (opts: { customerKey: string }) => {
    requestPayment: (opts: Record<string, unknown>) => Promise<void>;
  };
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
function loadTossSdk(): Promise<TossPaymentsFn> {
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

export type TossRailFailure = {
  kind: "unavailable" | "error" | "network" | "cancel";
  message?: string;
};

/**
 * 토스 결제창 시작. 성공적으로 결제창이 뜨고 리다이렉트되면 이 함수는
 * 돌아오지 않는다(페이지 이탈). 실패 시 원인 분류를 반환한다.
 * 사용자가 결제창을 닫은 것(USER_CANCEL)은 오류가 아니라 "취소"다.
 */
export async function startTossCheckout(input: {
  tier: "pro" | "expert";
  billing: "monthly" | "annual";
  orderName: string;
  customerEmail?: string | null;
}): Promise<TossRailFailure | null> {
  const clientKey = tossClientKey();
  if (!clientKey) return { kind: "unavailable", message: "토스 결제가 아직 준비되지 않았어요." };

  // 1) 서버에 주문 생성(로그인 필수 — 401 은 호출부가 로그인으로 보낸다)
  let orderId: string;
  let amount: number;
  try {
    const res = await fetch("/api/payments/toss/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: input.tier,
        billing: input.billing,
        source: "subscription",
        campaign: "newui-toss",
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      orderId?: string;
      amount?: number;
      error?: string;
    };
    if (!res.ok || !j.orderId || !Number.isFinite(j.amount)) {
      return res.status === 503
        ? { kind: "unavailable", message: j.error }
        : { kind: "error", message: j.error };
    }
    orderId = j.orderId;
    amount = Number(j.amount);
  } catch {
    return { kind: "network" };
  }

  // 2) SDK 로드 + 결제창 호출
  try {
    const TossPayments = await loadTossSdk();
    /* customerKey 는 토스 대시보드에 남는 식별자다 — 이메일(개인정보)을 그대로
       넣지 않는다. 일회성 결제이므로 SDK 가 제공하는 비회원 상수를 쓴다.
       (자동결제/빌링을 붙일 때는 무작위 고유키를 서버에서 발급해 저장할 것.) */
    const payment = TossPayments(clientKey).payment({
      customerKey: TossPayments.ANONYMOUS,
    });
    const origin = window.location.origin;
    await payment.requestPayment({
      // 통합결제창 — 카드 + 간편결제(토스페이 등)를 한 창에서 선택
      method: "CARD",
      amount: { currency: "KRW", value: amount },
      orderId,
      orderName: input.orderName.slice(0, 100),
      successUrl: `${origin}/payment/success`,
      failUrl: `${origin}/payment/fail`,
      ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
      card: {
        useEscrow: false,
        flowMode: "DEFAULT",
        useCardPoint: false,
        useAppCardOnly: false,
      },
    });
    // requestPayment 는 리다이렉트로 끝난다 — 여기 도달하면 이례적이지만 성공 취급
    return null;
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED") {
      return { kind: "cancel" };
    }
    const message =
      e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : undefined;
    return { kind: "error", message };
  }
}
