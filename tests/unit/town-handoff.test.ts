import { strict as assert } from "node:assert";
import test from "node:test";

import { townHandoff } from "../../lib/town/handoff";

test("시·군·구까지 있으면 지역과 district 를 함께 싣는다", () => {
  const h = townHandoff({ city: "서울", district: "강남구" });
  assert.equal(h.region, "서울 강남구");
  assert.equal(h.mapHref, "/map?region=%EC%84%9C%EC%9A%B8+%EA%B0%95%EB%82%A8%EA%B5%AC&district=%EA%B0%95%EB%82%A8%EA%B5%AC");
  assert.equal(h.noteNewHref, "/notes/new?region=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC");
});

test("시·도만 있으면 district 는 지어내지 않는다", () => {
  const h = townHandoff({ city: "서울", district: "" });
  assert.equal(h.region, "서울");
  assert.ok(h.mapHref.includes("region="));
  assert.ok(!h.mapHref.includes("district="), "없는 단서를 붙이면 안 된다");
});

test("지역을 모르면 기본 경로로 — 우리가 지역을 고르지 않는다", () => {
  const h = townHandoff({ city: null, district: null });
  assert.deepEqual(h, { region: "", mapHref: "/map", noteNewHref: "/notes/new" });
});

test("공백만 든 값은 없는 것으로 본다", () => {
  assert.deepEqual(townHandoff({ city: "  ", district: "\t" }), {
    region: "",
    mapHref: "/map",
    noteNewHref: "/notes/new",
  });
});

test("지역명이 URL 로 왕복해도 원래 문자열이 나온다", () => {
  const h = townHandoff({ city: "경기", district: "안양시 동안구" });
  const map = new URL(h.mapHref, "https://nuguzip.com");
  assert.equal(map.searchParams.get("region"), "경기 안양시 동안구");
  assert.equal(map.searchParams.get("district"), "안양시 동안구");
  const note = new URL(h.noteNewHref, "https://nuguzip.com");
  assert.equal(note.searchParams.get("region"), "경기 안양시 동안구");
});
