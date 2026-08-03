import "server-only";

import { createHash } from "node:crypto";

/**
 * 토스페이먼츠 결제 취소 — POST /v1/payments/{paymentKey}/cancel.
 *
 * 문서: docs.tosspayments.com/guides/v2/learn/payment-results (취소 흐름)
 *
 * 전액 취소만 지원한다(부분취소는 화면·정산 요건이 정해진 뒤에).
 * 멱등키는 orderId 에서 결정적으로 만든다 — 어드민이 버튼을 두 번 눌러도
 * 취소가 두 번 나가지 않는다(confirm 의 멱등키와 같은 방식, 접두사만 다름).
 */

function idempotencyKeyForCancel(orderId: string): string {
  const h = createHash("sha1").update(`nuguzip:toss:cancel:${orderId}`).digest();
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
          "Idempotency-Key": idempotencyKeyForCancel(input.orderId),
        },
        body: JSON.stringify({ cancelReason: input.cancelReason.slice(0, 200) }),
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
