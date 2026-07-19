/**
 * Apps-in-Toss(토스 앱 내 미니앱) 런타임 감지 및 토스페이 결제 SDK 어댑터 (클라이언트 전용).
 *
 * 토스페이 결제창(checkoutPayment)은 토스 앱(Apps-in-Toss) 환경에서만 동작합니다.
 * 일반 브라우저에서는 기존 토스페이먼츠(PG) 버튼을 사용하세요.
 */

export type TossCheckoutResult = { success: boolean; reason?: string };

/** 토스 앱(Apps-in-Toss) 웹뷰 환경 여부(best-effort). */
export function isInTossApp(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  // 토스 앱 웹뷰 UA 에는 "toss" 가 포함됩니다. 프레임워크 전역이 있으면 우선합니다.
  const w = window as unknown as { TossPay?: unknown; appsInToss?: unknown };
  if (w.TossPay || w.appsInToss) return true;
  return /toss/i.test(ua);
}

type FrameworkModule = {
  checkoutPayment?: (opts: { payToken: string }) => Promise<TossCheckoutResult>;
};

async function loadAppsInTossFramework(): Promise<FrameworkModule | null> {
  try {
    // 패키지 미설치 시 번들러가 정적으로 resolve 하지 않도록 변수 경로 동적 import.
    const modName = "@apps-in-toss/web-framework";
    const dynImport = new Function("m", "return import(m)") as (
      m: string,
    ) => Promise<FrameworkModule>;
    return await dynImport(modName);
  } catch {
    return null;
  }
}

/** 토스페이 결제창을 띄워 사용자 인증을 수행합니다. */
export async function runTossPayCheckout(payToken: string): Promise<TossCheckoutResult> {
  const mod = await loadAppsInTossFramework();
  if (!mod?.checkoutPayment) {
    return {
      success: false,
      reason: "토스 결제 모듈을 사용할 수 없습니다. 토스 앱에서 실행해 주세요.",
    };
  }
  return mod.checkoutPayment({ payToken });
}
