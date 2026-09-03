import { strict as assert } from "node:assert";
import test from "node:test";

import {
  EXPERT_TYPES,
  EXPERT_TYPE_LABELS,
  QUOTE_CATEGORIES,
  SPECIALTIES,
  findExpertType,
  findSpecialty,
  isExpertTypeLabel,
  isQuoteCategory,
  normalizeSpecialties,
  specialtiesOf,
} from "../../lib/experts/taxonomy";
import { EXPERT_SUBCATEGORIES } from "../../lib/subcategories";
import { EXPERT_VERIFICATION_SOURCES, primarySourceForExpertType } from "../../lib/experts/verification-sources";

/* [953] 전문가 분류 체계 — 네 곳(신청 폼·목록 필터·견적 카테고리·검증 출처)이
   한 파일을 읽는지, 그리고 정책 경계(법률 서비스 없음)가 지켜지는지. */

test("정책상 받지 않는 법률 서비스 유형은 분류 체계에 없다", () => {
  const all = [...EXPERT_TYPE_LABELS, ...SPECIALTIES.map((s) => s.label), ...QUOTE_CATEGORIES].join(" ");
  for (const bad of ["법무", "변호", "법률"]) {
    assert.ok(!all.includes(bad), `"${bad}" 가 분류 체계에 들어 있다`);
  }
});

test("신청 폼이 받는 모든 유형은 검증 출처가 있거나 '기타'다", () => {
  for (const t of EXPERT_TYPES) {
    if (t.id === "other") {
      assert.equal(t.source, null);
      continue;
    }
    assert.ok(t.source, `${t.label} 에 검증 출처가 없다`);
    assert.ok(t.source!.verificationUrl.startsWith("https://"));
    assert.ok(primarySourceForExpertType(t.label), `verification-sources 어댑터가 ${t.label} 을 못 찾는다`);
  }
  assert.equal(EXPERT_VERIFICATION_SOURCES.length, EXPERT_TYPES.filter((t) => t.source).length);
});

test("목록 필터 칩은 분류 체계의 분야와 1:1 이다(+전체)", () => {
  const chipIds = EXPERT_SUBCATEGORIES.map((c) => c.id);
  assert.equal(chipIds[0], "all");
  assert.deepEqual(chipIds.slice(1), SPECIALTIES.map((s) => s.id));
  for (const s of SPECIALTIES) {
    const chip = EXPERT_SUBCATEGORIES.find((c) => c.id === s.id)!;
    assert.equal(chip.label, s.label);
    assert.ok(chip.match.includes(s.label), "칩 매칭에 분야 라벨 자체가 포함돼야 프로필 저장 라벨과 맞는다");
  }
});

test("견적 카테고리는 quotable 분야만이고 중개 알선으로 읽히는 분야는 없다", () => {
  assert.deepEqual(QUOTE_CATEGORIES, SPECIALTIES.filter((s) => s.quotable).map((s) => s.label));
  assert.ok(!isQuoteCategory("매매/투자 상담"));
  assert.ok(isQuoteCategory("세무/절세"));
  assert.ok(isQuoteCategory(" 임장 동행 "));
});

test("유형 찾기는 id·라벨·부분 문자열을 모두 받는다", () => {
  assert.equal(findExpertType("broker")?.label, "공인중개사");
  assert.equal(findExpertType("세무사")?.id, "tax");
  assert.equal(findExpertType("개업공인중개사")?.id, "broker");
  assert.equal(findExpertType(""), null);
  assert.ok(isExpertTypeLabel("감정평가사"));
  assert.ok(!isExpertTypeLabel("변호사"));
});

test("전문 분야 정규화 — 알려진 라벨(id 포함)은 라벨로, 중복 제거, 길이·개수 상한", () => {
  const out = normalizeSpecialties(["세무/절세", "세무/절세", " 상가 ", "tax", "", "x".repeat(40)]);
  /* "tax" 는 분야 id → 라벨 "세무/절세" 로 정규화되고 첫 항목과 중복이라 사라진다 */
  assert.deepEqual(out, ["세무/절세", "상가", "x".repeat(20)]);
  assert.equal(normalizeSpecialties(["a", "b", "c", "d", "e", "f", "g", "h", "i"], 8).length, 8);
});

test("자유 입력 문자열에서 분야 추정", () => {
  const found = specialtiesOf(["공인중개사", "재건축 갈아타기 전문"]).map((s) => s.id);
  assert.ok(found.includes("remodel"));
  assert.ok(found.includes("trade"));
  assert.equal(findSpecialty("escort")?.label, "임장 동행");
});
