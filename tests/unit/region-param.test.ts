import { strict as assert } from "node:assert";
import test from "node:test";

import {
  normalizeRegionText,
  pickRegionByAnyName,
} from "../../lib/regions/param";

/* 세 화면의 실제 어휘를 그대로 옮긴 목록 — 이 표기 차이가 D62 의 원인이다. */
const TX_REGIONS = [
  { slug: "서울-강남구", name: "서울 강남구" },
  { slug: "서울-송파구", name: "서울 송파구" },
  { slug: "고양-덕양구", name: "고양 덕양구" },
];
const CATALOG = [
  { id: "gangnam", label: "강남구" },
  { id: "songpa", label: "송파구" },
  { id: "goyang-deogyang", label: "고양 덕양구" },
];

test("자기 어휘는 당연히 찾는다", () => {
  assert.equal(pickRegionByAnyName("서울-강남구", TX_REGIONS)?.slug, "서울-강남구");
  assert.equal(pickRegionByAnyName("gangnam", CATALOG)?.id, "gangnam");
});

test("지도 어휘(한글 지역명) → 실거래 슬러그", () => {
  assert.equal(pickRegionByAnyName("서울 강남구", TX_REGIONS)?.slug, "서울-강남구");
});

test("카탈로그 어휘(구 이름만) → 실거래 지역", () => {
  /* 여기가 실제로 조용히 틀리던 자리다 — 예전 코드는 못 찾고 첫 지역으로 갈아탔다. */
  assert.equal(pickRegionByAnyName("강남구", TX_REGIONS)?.slug, "서울-강남구");
});

test("실거래 어휘 → 카탈로그 id", () => {
  assert.equal(pickRegionByAnyName("서울 강남구", CATALOG)?.id, "gangnam");
  assert.equal(pickRegionByAnyName("서울-강남구", CATALOG)?.id, "gangnam");
});

test("행정구역 접미사와 공백 차이를 흡수한다", () => {
  assert.equal(pickRegionByAnyName("서울특별시 강남구", TX_REGIONS)?.slug, "서울-강남구");
  assert.equal(pickRegionByAnyName("  서울  강남구 ", TX_REGIONS)?.slug, "서울-강남구");
});

test("두 토막 지역명도 정확히 간다", () => {
  assert.equal(pickRegionByAnyName("고양 덕양구", TX_REGIONS)?.slug, "고양-덕양구");
  assert.equal(pickRegionByAnyName("덕양구", TX_REGIONS)?.slug, "고양-덕양구");
});

test("모호하면 고르지 않는다 — 조용한 대체가 이 함수가 없애려는 버그다", () => {
  /* "서울"은 강남구·송파구 둘 다에 걸린다. 하나를 고르면 사용자가 고른 적 없는
     동네를 보여 주게 된다. */
  assert.equal(pickRegionByAnyName("서울", TX_REGIONS), null);
});

test("목록에 없는 지역은 null — 첫 항목으로 대체하지 않는다", () => {
  assert.equal(pickRegionByAnyName("부산 해운대구", TX_REGIONS), null);
  assert.equal(pickRegionByAnyName("없는동네", CATALOG), null);
});

test("빈 값·빈 목록은 null", () => {
  assert.equal(pickRegionByAnyName("", TX_REGIONS), null);
  assert.equal(pickRegionByAnyName(null, TX_REGIONS), null);
  assert.equal(pickRegionByAnyName("강남구", []), null);
});

test("정규화는 하이픈·공백·접미사만 지운다", () => {
  assert.equal(normalizeRegionText("서울-강남구"), "서울강남구");
  assert.equal(normalizeRegionText("서울특별시 강남구"), "서울강남구");
  assert.equal(normalizeRegionText(" GANGNAM "), "gangnam");
});
