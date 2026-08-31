/* [938] R-ONE 광역(시도) 서울 행 매칭 회귀 잠금.
   실측(2026-08-31): market_price_indices(홈 "매매지수 서울" 1순위 원천)를 쓰는
   코드가 코드베이스에 없어 07-17 이후 방치 — 부동산원이 공식 발표하는 서울
   광역 지수 행이 구 단위 매처에서 버려지고 있었다. 광역 행은 잡고, 구 단지
   행·전국·타 시도 광역 행은 잡지 않는 경계를 잠근다. */
import test from "node:test";
import assert from "node:assert/strict";
import { matchSeoulCitywide, SIDO_SEOUL_ID } from "../../lib/reb/client.ts";

test("광역 서울 행을 잡는다 — 단독·권역 경유 표기 모두", () => {
  for (const cls of ["서울", "전국>수도권>서울", "수도권>서울", "서울특별시"]) {
    const m = matchSeoulCitywide(cls);
    assert.ok(m, `${cls} 는 광역 서울로 매칭돼야 한다`);
    assert.equal(m?.id, SIDO_SEOUL_ID);
    assert.equal(m?.name, "서울");
  }
});

test("구 단위·전국·타 시도는 잡지 않는다", () => {
  for (const cls of [
    "서울>강남구",
    "전국>수도권>서울>강남구",
    "전국",
    "수도권",
    "경기",
    "전국>수도권>경기",
    "부산",
    null,
    "",
  ]) {
    assert.equal(matchSeoulCitywide(cls), null, `${String(cls)} 는 null 이어야 한다`);
  }
});
