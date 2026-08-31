/**
 * "이 자식은 화면에 무언가를 그리는가?" 를 판정하는 순수 함수.
 *
 * 빈 공간의 절반은 여기서 갈린다. 리액트는 `null`·`false`·`undefined` 를
 * 아무것도 아닌 것으로 그리지만, **그것들을 감싼 상자는 그대로 그린다**.
 * 그래서 `<div className="card p-5">{cond && <X/>}</div>` 는 조건이 꺼지는
 * 순간 "패딩만 남은 빈 카드"가 된다. 목록·섹션에서 이게 쌓이면 화면에
 * 설명할 수 없는 빈 칸이 생긴다.
 *
 * 상자를 그리기 **전에** 내용 유무를 먼저 묻자는 것이 이 파일의 목적이다.
 * 리액트에 의존하지 않는 값 판정이라 단위 테스트로 고정할 수 있다.
 */

/** 공백만 있는 문자열은 "내용 없음"으로 본다 — 줄바꿈 하나가 칸을 만들지 않도록 */
function isBlankString(v: unknown): boolean {
  return typeof v === "string" && v.trim() === "";
}

/**
 * 화면에 무언가 남기는 값이면 true.
 *
 * false 로 보는 것: null, undefined, true/false(조건식 잔여), 빈/공백 문자열,
 * 그리고 위의 것들만 들어 있는 배열(중첩 포함).
 * 0 은 **true 다** — "거래 0건" 처럼 0 자체가 정보인 자리가 있다.
 */
export function isRenderable(node: unknown): boolean {
  if (node === null || node === undefined) return false;
  if (typeof node === "boolean") return false;
  if (isBlankString(node)) return false;
  if (Array.isArray(node)) return node.some(isRenderable);
  return true;
}

/** 그려지는 자식만 남긴 배열. 하나도 없으면 빈 배열. */
export function compactChildren(children: unknown): unknown[] {
  const list = Array.isArray(children) ? children : [children];
  return list.filter(isRenderable);
}

/** 그려지는 자식이 하나라도 있는가 */
export function hasContent(children: unknown): boolean {
  return isRenderable(children);
}
