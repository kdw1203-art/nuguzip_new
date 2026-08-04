/**
 * 구글 광고(Google Ads) 전환 추적 — 환경변수 기반, 동의 게이트 뒤에서만.
 *
 * 도입 구조(소유자 요청 2026-08-04 — "토스 광고 아님, 구글 광고로"):
 *  - 사이트에는 이미 동의 게이트를 통과한 GA4 gtag 가 있다(ga4-gtag-loader).
 *    구글 광고 태그(AW-…)는 **같은 gtag 위에 config 한 줄**로 얹힌다 —
 *    스크립트를 하나 더 싣지 않고, 동의 없이 요청이 나가지도 않는다.
 *  - 전환 이벤트는 두 겹으로 잡힌다:
 *      (1) GA4 표준 이벤트(purchase·sign_up) — 광고 콘솔에서 "GA4 전환
 *          가져오기"만 하면 코드 수정 없이 전환으로 쓸 수 있다.
 *      (2) AW 직접 전환(send_to: AW-ID/라벨) — 라벨 env 가 설정된 경우에만.
 *          라벨은 광고 콘솔 > 목표 > 전환 만들기에서 발급된다.
 *
 * 값이 없으면 전부 무동작 — 광고 계정을 만들기 전에는 아무 요청도 나가지 않는다.
 */

/** 구글 광고 태그 ID (형식 AW-XXXXXXXXX). 광고 콘솔 > 도구 > Google 태그. */
export function googleAdsId(): string | null {
  const v = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
  return v && v.startsWith("AW-") ? v : null;
}

/** 결제 전환 라벨(선택). 콘솔의 "전환 만들기 > 구매"에서 발급된 라벨 문자열. */
export function purchaseConversionLabel(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL?.trim() || null;
}

/** 가입 전환 라벨(선택). */
export function signupConversionLabel(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL?.trim() || null;
}

type Gtag = (...args: unknown[]) => void;

/** AW 직접 전환 전송 — 라벨이 없으면 조용히 건너뛴다(GA4 이벤트가 1차 경로). */
export function sendAdsConversion(
  gtag: Gtag,
  label: string | null,
  params: { value?: number; transactionId?: string },
): void {
  const id = googleAdsId();
  if (!id || !label) return;
  gtag("event", "conversion", {
    send_to: `${id}/${label}`,
    ...(params.value != null ? { value: params.value, currency: "KRW" } : {}),
    ...(params.transactionId ? { transaction_id: params.transactionId } : {}),
  });
}
