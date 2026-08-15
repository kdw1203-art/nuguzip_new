import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deterministicIdempotencyKey,
  idempotencyKeyForOrder,
} from "../../lib/payments/idempotency.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("멱등키는 UUID v5 형식(version 5·RFC4122 variant)", () => {
  const k = deterministicIdempotencyKey("seed-x");
  assert.match(k, UUID_RE, `형식 위반: ${k}`);
});

test("같은 seed 는 늘 같은 키(결정적 — 재시도 이중청구 방지의 핵심)", () => {
  const a = deterministicIdempotencyKey("nuguzip:toss:billing:sub-1:2026-08");
  const b = deterministicIdempotencyKey("nuguzip:toss:billing:sub-1:2026-08");
  assert.equal(a, b);
});

test("다른 seed 는 다른 키(주문·주기가 다르면 키가 갈린다)", () => {
  const a = deterministicIdempotencyKey("sub-1:2026-08");
  const b = deterministicIdempotencyKey("sub-1:2026-09");
  assert.notEqual(a, b);
});

test("idempotencyKeyForOrder 는 orderId 당 결정적", () => {
  const a = idempotencyKeyForOrder("WOODONG-123");
  const b = idempotencyKeyForOrder("WOODONG-123");
  assert.equal(a, b);
  assert.match(a, UUID_RE);
  assert.notEqual(idempotencyKeyForOrder("WOODONG-123"), idempotencyKeyForOrder("WOODONG-124"));
});
