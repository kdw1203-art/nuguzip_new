import { test } from "node:test";
import assert from "node:assert/strict";
import { isRenderable, compactChildren, hasContent } from "../../lib/ui/renderable.ts";

/* 빈 공간 방지의 판정 규칙을 잠근다.
   여기가 흔들리면 "조건이 꺼졌는데 상자만 남는" 화면이 다시 생긴다. */

test("아무것도 그리지 않는 값은 false", () => {
  for (const v of [null, undefined, false, true, "", "   ", "\n\t"]) {
    assert.equal(isRenderable(v), false, `${JSON.stringify(v)} 는 내용 없음이어야 한다`);
  }
});

test("0 은 내용이다 — '거래 0건' 같은 자리를 지운 적이 있다", () => {
  assert.equal(isRenderable(0), true);
  assert.equal(isRenderable("0"), true);
});

test("빈 것들만 든 배열은 false, 하나라도 있으면 true", () => {
  assert.equal(isRenderable([null, false, undefined, ""]), false);
  assert.equal(isRenderable([null, false, "글"]), true);
  assert.equal(isRenderable([[null, [false, ""]], []]), false);
  assert.equal(isRenderable([[null, [false, "x"]]]), true);
});

test("compactChildren 은 그려지는 것만 남긴다", () => {
  assert.deepEqual(compactChildren([null, "a", false, "", "b", undefined]), ["a", "b"]);
  assert.deepEqual(compactChildren([null, false]), []);
  assert.deepEqual(compactChildren("a"), ["a"]);
  assert.deepEqual(compactChildren(null), []);
});

test("hasContent 는 컨테이너를 그릴지 말지의 한 줄 판정", () => {
  assert.equal(hasContent([null, false]), false);
  assert.equal(hasContent([null, 0]), true);
  assert.equal(hasContent(undefined), false);
});

test("객체(리액트 엘리먼트 자리)는 내용으로 본다", () => {
  assert.equal(isRenderable({ type: "div" }), true);
  assert.equal(isRenderable([{ type: "div" }]), true);
});
