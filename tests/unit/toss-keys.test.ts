import { strict as assert } from "node:assert";
import test from "node:test";

import {
  checkTossKeyPair,
  isBillingCapableClientKey,
  parseTossClientKey,
  parseTossSecretKey,
} from "../../lib/payments/toss-keys";

/* 실제 상점의 키 모양을 그대로 쓴다(클라이언트 키는 브라우저에 실리는 공개 값).
   시크릿 키는 형태만 흉내 낸 더미다 — 진짜 시크릿은 코드·테스트에 두지 않는다. */
const WIDGET_CK = "live_gck_LlDJaYngroGk5MB5W9ylrezGdRpX"; // 주문서형·결제창형
const GENERAL_CK = "live_ck_BX7zk2yd8yzay2nwE7MY3x9POLqK"; // MID nuguzibowg
const BILLING_CK = "live_ck_GjLJoQ1aVZ5pjwDqlMB13w6KYe2R"; // MID bill_nuguzevk8
const WIDGET_SK = "live_gsk_0000000000000000000000000000";
const API_SK = "live_sk_0000000000000000000000000000";

test("gck 는 ck 로도 끝나지만 위젯 키로 읽어야 한다", () => {
  /* 짧은 접두사부터 보면 live_gck_ 가 live_ck_ 로 오인될 수 있다 — 순서 회귀 방지 */
  const w = parseTossClientKey(WIDGET_CK);
  assert.equal(w.state, "ok");
  assert.deepEqual(w, { state: "ok", mode: "live", kind: "widget" });

  const a = parseTossClientKey(GENERAL_CK);
  assert.deepEqual(a, { state: "ok", mode: "live", kind: "api" });
});

test("시크릿 키도 gsk / sk 를 가른다", () => {
  assert.deepEqual(parseTossSecretKey(WIDGET_SK), { state: "ok", mode: "live", kind: "widget" });
  assert.deepEqual(parseTossSecretKey(API_SK), { state: "ok", mode: "live", kind: "api" });
  assert.deepEqual(parseTossSecretKey("test_sk_abc"), { state: "ok", mode: "test", kind: "api" });
});

test("미설정·형식 오류를 구분한다", () => {
  assert.deepEqual(parseTossClientKey(undefined), { state: "missing" });
  assert.deepEqual(parseTossClientKey("   "), { state: "missing" });
  assert.equal(parseTossClientKey("sk_live_stripe").state, "invalid");
});

test("같은 세트만 통과한다", () => {
  assert.equal(checkTossKeyPair(WIDGET_CK, WIDGET_SK).ok, true);
  assert.equal(checkTossKeyPair(GENERAL_CK, API_SK).ok, true);
});

test("종류가 어긋난 짝을 잡는다 — 위젯 클라이언트 + API 시크릿", () => {
  /* 화면에는 결제창이 뜨는데 승인에서 깨지는, 가장 나쁜 실패 모양이다. */
  const v = checkTossKeyPair(WIDGET_CK, API_SK);
  assert.equal(v.ok, false);
  assert.match(v.reason, /키 세트 불일치/);
});

test("환경이 어긋난 짝을 잡는다 — live 클라이언트 + test 시크릿", () => {
  const v = checkTossKeyPair(GENERAL_CK, "test_sk_abc");
  assert.equal(v.ok, false);
  assert.match(v.reason, /환경 불일치/);
});

test("한쪽만 없는 경우를 구분해서 말한다", () => {
  assert.match(checkTossKeyPair(GENERAL_CK, undefined).reason, /시크릿 키 미설정/);
  assert.match(checkTossKeyPair(undefined, API_SK).reason, /클라이언트 키 미설정/);
  assert.match(checkTossKeyPair(undefined, undefined).reason, /모두 미설정/);
});

test("자동결제 카드 등록은 API 개별 연동 키(ck)만 가능하다", () => {
  /* 문서: 위젯 키로 결제창 SDK 를 초기화하면 오류. requestBillingAuth 는 결제창 SDK. */
  assert.equal(isBillingCapableClientKey(BILLING_CK), true);
  assert.equal(isBillingCapableClientKey(GENERAL_CK), true);
  assert.equal(isBillingCapableClientKey(WIDGET_CK), false);
  assert.equal(isBillingCapableClientKey(undefined), false);
});

test("자동결제 키와 일반결제 키는 서로 다른 MID 라 값이 다르다", () => {
  assert.notEqual(GENERAL_CK, BILLING_CK);
  // 둘 다 live · api 세트라 종류 판정만으로는 구분되지 않는다 — 그래서 env 를 나눈다
  assert.deepEqual(parseTossClientKey(GENERAL_CK), parseTossClientKey(BILLING_CK));
});
