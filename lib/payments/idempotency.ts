import { createHash } from "node:crypto";

/**
 * 결제 멱등키 생성 — **순수 함수. server-only·DB·env 의존 없음(테스트 가능).**
 *
 * 토스 승인/빌링 승인은 같은 주문·주기의 재시도가 첫 응답을 그대로 받아야
 * 이중 청구가 안 난다. 난수를 쓰면 재시도마다 키가 달라져 멱등성이 깨진다 —
 * seed 로부터 결정적으로 UUID v5 형태를 만든다(토스 기준 15일 유효).
 *
 * confirm 라우트·toss-billing 이 이 한 곳을 공유한다(로직이 두 곳에 있으면
 * 언젠가 갈라진다). tests/unit/idempotency.test.ts 가 결정성·형식을 지킨다.
 */
export function deterministicIdempotencyKey(seed: string): string {
  const h = createHash("sha1").update(seed).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 주문 승인용 멱등키 — orderId 하나당 늘 같은 키(재시도해도 동일). */
export function idempotencyKeyForOrder(orderId: string): string {
  return deterministicIdempotencyKey(`nuguzip:toss:confirm:${orderId}`);
}
