import { strict as assert } from "node:assert";
import { test } from "node:test";
import { filterNotesByRegion, noteRegionMatches } from "../../lib/imjang/notes-match";

/* U3 플라이휠 조인 — 노트 region(동 단위) ↔ 실거래 지역명(구 단위) 매칭 규칙 */

test("동 단위 노트가 구 단위 지역에 매칭된다", () => {
  assert.equal(noteRegionMatches("서울 송파구 가락동", "서울 송파구"), true);
  assert.equal(noteRegionMatches("서울특별시 송파구 가락동", "서울 송파구"), true); // 긴 표기도 정규화
  assert.equal(noteRegionMatches("경기 화성시 동탄구", "화성시"), true); // 도 접두 제거
});

test("다른 지역·우연한 접두는 매칭되지 않는다", () => {
  assert.equal(noteRegionMatches("서울 송파구 가락동", "서울 강남구"), false);
  /* 공백 경계: "서울 송파구"가 "서울 송파구청..."에 접두로 걸리면 안 된다 */
  assert.equal(noteRegionMatches("서울 송파구청 인근", "서울 송파구"), false);
  assert.equal(noteRegionMatches(null, "서울 송파구"), false);
});

test("filterNotesByRegion — 상한과 순서 유지", () => {
  const notes = [
    { region: "서울 송파구 가락동", id: 1 },
    { region: "서울 강남구 대치동", id: 2 },
    { region: "서울 송파구 잠실동", id: 3 },
    { region: "서울 송파구 방이동", id: 4 },
  ];
  const out = filterNotesByRegion(notes, "서울 송파구", 2);
  assert.deepEqual(out.map((n) => n.id), [1, 3]);
});
