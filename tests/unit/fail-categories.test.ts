import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categorizeFailure,
  CATEGORY_MESSAGE,
  KNOWN_CODES,
} from "../../lib/payments/fail-categories.ts";

test("세션 만료 코드 → session_expired (카드 문제로 오해 방지)", () => {
  assert.equal(categorizeFailure({ code: "NOT_FOUND_PAYMENT_SESSION" }), "session_expired");
  assert.match(CATEGORY_MESSAGE.session_expired, /10분/);
  assert.match(CATEGORY_MESSAGE.session_expired, /빠져나가지 않았어요/);
});

test("빌링 키 오류 → billing_card", () => {
  assert.equal(categorizeFailure({ code: "NOT_FOUND_BILLING_KEY" }), "billing_card");
  assert.equal(categorizeFailure({ code: "INVALID_BILL_KEY_REQUEST" }), "billing_card");
});

test("키·요청 구성 오류 → not_configured (상점 설정 문제)", () => {
  for (const c of ["UNAUTHORIZED_KEY", "INVALID_CLIENT_KEY", "FORBIDDEN_REQUEST"]) {
    assert.equal(categorizeFailure({ code: c }), "not_configured", c);
  }
});

test("사용자 취소 — 코드/하이픈 표기/checkout=cancel 모두", () => {
  assert.equal(categorizeFailure({ code: "PAY_PROCESS_CANCELED" }), "user_cancel");
  assert.equal(categorizeFailure({ code: "pay-process-canceled" }), "user_cancel"); // 소문자·하이픈 정규화
  assert.equal(categorizeFailure({ checkout: "cancel" }), "user_cancel");
});

test("한도·카드거절·카드정보 매핑", () => {
  assert.equal(categorizeFailure({ code: "NOT_ENOUGH_BALANCE" }), "limit_exceeded");
  assert.equal(categorizeFailure({ code: "REJECT_CARD_COMPANY" }), "card_rejected");
  assert.equal(categorizeFailure({ code: "INVALID_STOPPED_CARD" }), "invalid_card");
});

test("모르는 코드 → unknown (임의 문구 반사 금지)", () => {
  assert.equal(categorizeFailure({ code: "SOMETHING_WEIRD" }), "unknown");
  assert.equal(categorizeFailure({}), "unknown");
});

test("모든 KNOWN_CODES 값에 대응하는 메시지가 있다(고아 카테고리 없음)", () => {
  for (const cat of Object.values(KNOWN_CODES)) {
    assert.ok(CATEGORY_MESSAGE[cat], `메시지 누락: ${cat}`);
  }
});
