import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeDemandEmail } from "@/lib/coverage/email";

/* 커버리지 수요 이메일 정제(#413) — 무인증 공개 API 의 입력 방어 순수함수 */

test("정상 이메일은 소문자·trim 정규화", () => {
  assert.equal(sanitizeDemandEmail("  KDW1203@Gmail.com "), "kdw1203@gmail.com");
});

test("이메일 아님·과길이·비문자열은 null", () => {
  assert.equal(sanitizeDemandEmail("not-an-email"), null);
  assert.equal(sanitizeDemandEmail("a@b"), null);
  assert.equal(sanitizeDemandEmail(`${"x".repeat(121)}@a.co`), null);
  assert.equal(sanitizeDemandEmail(123), null);
  assert.equal(sanitizeDemandEmail(null), null);
  assert.equal(sanitizeDemandEmail("공백 있는@a.co"), null);
});
