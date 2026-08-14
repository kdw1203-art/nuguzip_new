#!/usr/bin/env node
/**
 * 모더레이션 필터 게이트 — 필터가 우회 표기를 실제로 잡는지 실증한다.
 *
 * 원칙: "고쳐 놓고 0건이 나오는 건 아무것도 증명하지 않는다 — 검사기가 그
 * 결함을 실제로 잡는지 먼저 확인한다." 이 게이트는 (a) 잡아야 할 우회 표기를
 * 못 잡으면 FAIL, (b) 잡으면 안 되는 정상 문장을 잡아도 FAIL 이다.
 * 필터를 약화시키는 회귀(정규화 제거·env 대체 함정 재도입)가 빌드에서 걸린다.
 *
 * lib/community/moderation.ts 는 TS 라 직접 import 이 안 된다 — 동일 로직을
 * 여기 복제하지 않고, **소스에서 정규화 규칙·목록을 읽어 와** 함수로 조립해
 * 검사한다(로직 복제는 언젠가 갈라진다).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "[check-moderation-filter]";
const src = readFileSync(join(root, "lib/community/moderation.ts"), "utf8");

/* 소스 계약 검증 — 정규화가 지워지면 여기서 끊는다 */
const contracts = [
  ['normalize("NFKC")', "NFKC 정규화가 사라졌습니다"],
  ["[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]", "기호 제거 정규식이 사라졌습니다"],
  ["...new Set([...base, ...extra])", "env 합집합 규칙이 사라졌습니다(대체 함정 재도입)"],
];
let failed = 0;
for (const [needle, why] of contracts) {
  if (!src.includes(needle)) {
    failed += 1;
    console.error(`${TAG} FAIL — ${why}: ${needle}`);
  }
}

/* 목록을 소스에서 추출해 동작 검증 */
const listMatch = src.match(/DEFAULT_BANNED_WORDS = \[([\s\S]*?)\];/);
if (!listMatch) {
  console.error(`${TAG} FAIL — DEFAULT_BANNED_WORDS 를 찾지 못했습니다`);
  process.exit(1);
}
const words = [...listMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (words.length < 20) {
  failed += 1;
  console.error(`${TAG} FAIL — 기본 금칙어가 ${words.length}개뿐입니다(확장 목록 유실, 기준 20+)`);
}

const normalize = (t) =>
  t.toLowerCase().normalize("NFKC").replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
const find = (t) => {
  const n = normalize(t);
  for (const w of words) {
    const needle = normalize(w);
    if (needle && n.includes(needle)) return w;
  }
  return null;
};

/* (a) 잡아야 한다 — 실운영 우회 표기 */
const mustCatch = [
  "도 박 사이트 홍보합니다",
  "도.박.문.의",
  "카지노 첫충 이벤트",
  "리딩방 초대합니다",
  "소액결제 현금화 해드려요",
  "조건 만남 구해요",
  "대포 통장 삽니다",
];
for (const t of mustCatch) {
  if (!find(t)) {
    failed += 1;
    console.error(`${TAG} FAIL — 우회 표기를 못 잡습니다: "${t}"`);
  }
}

/* (b) 잡으면 안 된다 — 정상 부동산 대화 (오차단은 커뮤니티를 죽인다) */
const mustPass = [
  "이 단지 학군이 좋아요",
  "관리비가 도합 30만원이에요",      // "도합" ≠ 도박
  "재건축 불확실성이 커요",           // "불법" 오매칭 방지 확인
  "마감재가 약간 아쉬워요",           // "마약" 오매칭 방지 확인
  "성남 매매가 추이 궁금해요",
];
for (const t of mustPass) {
  const hit = find(t);
  if (hit) {
    failed += 1;
    console.error(`${TAG} FAIL — 정상 문장을 오차단합니다: "${t}" (매칭: ${hit})`);
  }
}

if (failed > 0) {
  console.error(`${TAG} ${failed}건 실패 — 필터가 약해졌거나 오차단합니다.`);
  process.exit(1);
}
console.info(
  `${TAG} PASS — 금칙어 ${words.length}종 · 우회 표기 ${mustCatch.length}건 검출 · 정상 문장 ${mustPass.length}건 통과`,
);
