import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findBlockedWord,
  normalizeForModeration,
} from "../../lib/community/moderation.ts";

test("정규화 — 공백·구두점·전각을 접는다", () => {
  assert.equal(normalizeForModeration("도 박"), "도박");
  assert.equal(normalizeForModeration("도.박"), "도박");
  assert.equal(normalizeForModeration("Ｔｏｔｏ"), "toto"); // 전각→반각+소문자
});

test("우회 표기를 잡는다(제품 리뷰 결함 해소)", () => {
  assert.ok(findBlockedWord("도 박 사이트 홍보"));
  assert.ok(findBlockedWord("카.지.노 첫충"));
  assert.ok(findBlockedWord("리딩방 초대"));
  assert.ok(findBlockedWord("소액결제 현금화"));
});

test("정상 부동산 대화를 오차단하지 않는다", () => {
  assert.equal(findBlockedWord("이 단지 학군이 좋아요"), null);
  assert.equal(findBlockedWord("관리비가 도합 30만원"), null); // '도합' ≠ 도박
  assert.equal(findBlockedWord("재건축 불확실성이 커요"), null);
  assert.equal(findBlockedWord("마감재가 아쉬워요"), null); // '마감' ≠ 마약
});
