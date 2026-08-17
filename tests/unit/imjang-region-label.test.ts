import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeRegionLabel } from "../../lib/imjang/region-label";

/* 모임 지역 표기 → 실거래 지역명 정규화 — 보수적 정확 일치의 전제 검증 */

test("광역시·특별시는 짧은 접두로", () => {
  assert.equal(normalizeRegionLabel("서울특별시 강남구"), "서울 강남구");
  assert.equal(normalizeRegionLabel("대구광역시 수성구"), "대구 수성구");
  assert.equal(normalizeRegionLabel("서울 강서구"), "서울 강서구"); // 이미 짧으면 그대로
});

test("도(道) 접두는 버린다", () => {
  assert.equal(normalizeRegionLabel("경기도 남양주시"), "남양주시");
  assert.equal(normalizeRegionLabel("경기도 안양시 동안구"), "안양시 동안구");
  assert.equal(normalizeRegionLabel("제주특별자치도 제주시"), "제주시");
  assert.equal(normalizeRegionLabel("강원특별자치도 춘천시"), "춘천시");
});

test("경기 광주시는 광주광역시로 오인하지 않는다", () => {
  assert.equal(normalizeRegionLabel("경기도 광주시"), "광주시");
  assert.equal(normalizeRegionLabel("광주광역시 남구"), "광주 남구");
});

test("빈 값·공백은 빈 문자열", () => {
  assert.equal(normalizeRegionLabel("  "), "");
});
