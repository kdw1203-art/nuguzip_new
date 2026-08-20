import "server-only";

import { createHash } from "node:crypto";

/**
 * 토스페이먼츠 결제 취소 — POST /v1/payments/{paymentKey}/cancel.
 *
 * 문서: docs.tosspayments.com/guides/v2/learn/payment-results (취소 흐름)
 *
 * 전액 취소(청약철회)와 부분 취소(중도 해지 일할 환불 — cancelAmount) 모두 지원.
 * 멱등키는 orderId(+부분취소 금액)에서 결정적으로 만든다 — 어드민이 버튼을 두 번
 * 눌러도 같은 취소가 두 번 나가지 않는다(confirm 의 멱등키와 같은 방식, 접두사만
 * 다름). 부분취소는 금액이 다르면 다른 요청이므로 금액을 키에 포함한다.
 */

function idempotencyKeyForCancel(orderId: string, cancelAmount?: number): string {
  const seed =
    cancelAmount == null
      ? `nuguzip:toss:cancel:${orderId}`
      : `nuguzip:toss:cancel:${orderId}:${cancelAmount}`;
  const h = createHash("sha1").update(seed).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type TossCancelResult =
  | { ok: true; status: string | null }
  | { ok: false; httpStatus: number; code: string | null; message: string };

export async function cancelTossPayment(input: {
  paymentKey: string;
  orderId: string;
  cancelReason: string;
  /** 부분 취소 금액(원). 생략하면 전액 취소. */
  cancelAmount?: number;
}): Promise<TossCancelResult> {
  const secret = process.env.TOSS_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: false, httpStatus: 0, code: "NOT_CONFIGURED", message: "TOSS_SECRET_KEY 미설정" };
  }
  try {
    const res = await fetch(
      `https://api.tosspayments.com/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyForCancel(input.orderId, input.cancelAmount),
        },
        body: JSON.stringify({
          cancelReason: input.cancelReason.slice(0, 200),
          ...(input.cancelAmount != null ? { cancelAmount: input.cancelAmount } : {}),
        }),
        cache: "no-store",
      },
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        code: typeof json.code === "string" ? json.code : null,
        message: typeof json.message === "string" ? json.message : `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: typeof json.status === "string" ? json.status : null };
  } catch (e) {
    return {
      ok: false,
      httpStatus: 0,
      code: "NETWORK",
      message: e instanceof Error ? e.message : "네트워크 오류",
    };
  }
}
