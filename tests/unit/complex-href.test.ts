/* [OPT · 308 제거] 내부 링크가 정규 슬러그를 바로 내보내는지 회귀 잠금.
   실측(2026-08-24 Vercel): 단지 페이지 24h 308 리다이렉트 4,736건 — 내부 링크가
   base64 순수 id 를 써서 매 클릭이 한 홉을 물던 문제. 헬퍼가 미들웨어와 같은
   규칙(한글 슬러그.꼬리id)을 내야 리다이렉트 없이 바로 200 이 된다. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  complexHrefFromId,
  complexHrefFromNames,
  pureIdFromParam,
  decodeNameIdSafe,
} from "../../lib/seo/complex-slug.ts";

const REGION = "서울 중랑구";
const NAME = "세이지움태릉입구역";
// 서버 encodeComplexId(region + \x01 + name) 의 base64url (ai-internal-live 와 동일 상단 id)
const PURE_ID = "7ISc7Jq4IOykkeuekeq1rAHshLjsnbTsp4Dsm4Dtg5zrponsnoXqtazsl60";

test("complexHrefFromNames: 한글 슬러그.꼬리id 형태를 낸다", () => {
  const href = complexHrefFromNames(REGION, NAME);
  const decoded = decodeURIComponent(href.replace("/complex/", ""));
  assert.ok(decoded.includes("."), "슬러그와 id 사이에 '.' 이 있어야 한다");
  assert.ok(decoded.startsWith("서울-중랑구-"), "지역-단지 슬러그로 시작해야 한다");
  assert.equal(decoded.split(".").pop(), PURE_ID, "꼬리 id 는 서버 encodeComplexId 와 같아야 한다");
});

test("complexHrefFromId(순수 id): 같은 정규 href 를 낸다 (미들웨어 308 불필요)", () => {
  const href = complexHrefFromId(PURE_ID);
  assert.equal(href, complexHrefFromNames(REGION, NAME));
});

test("complexHrefFromId 는 멱등: 이미 장식된 파라미터를 다시 장식하지 않는다", () => {
  const once = complexHrefFromId(PURE_ID);
  const param = decodeURIComponent(once.replace("/complex/", ""));
  const twice = complexHrefFromId(param);
  assert.equal(twice, once, "장식된 파라미터를 넣어도 결과가 같아야 한다(중복 슬러그 금지)");
  // 꼬리 id 는 여전히 순수 id 하나뿐
  assert.equal(pureIdFromParam(decodeURIComponent(twice.replace("/complex/", ""))), PURE_ID);
});

test("kapt id·해석 불가 id 는 안전하게 그대로 둔다", () => {
  assert.equal(complexHrefFromId("kapt.A13800001"), "/complex/kapt.A13800001");
  assert.equal(complexHrefFromId("!!!notbase64!!!"), "/complex/" + encodeURIComponent("!!!notbase64!!!"));
});

test("빈 입력 방어", () => {
  assert.equal(complexHrefFromId(""), "/complex");
  assert.equal(complexHrefFromNames("", NAME), "/complex");
  assert.equal(complexHrefFromNames(REGION, ""), "/complex");
});

test("decodeNameIdSafe 왕복: 순수 id → region/name 복원", () => {
  const dec = decodeNameIdSafe(PURE_ID);
  assert.deepEqual(dec, { region: REGION, name: NAME });
});
