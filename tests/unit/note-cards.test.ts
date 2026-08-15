import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_THEMES, getCardTheme, isValidThemeId } from "../../lib/notes/card-themes.ts";
import {
  CARD_FRAMES,
  availableFrames,
  averageScore,
  type NoteCardSource,
} from "../../lib/notes/card-frames.ts";
import {
  autoBuildConfig,
  normalizeConfig,
  isConfigComplete,
  MIN_FRAMES,
} from "../../lib/notes/card-config.ts";

function richSource(): NoteCardSource {
  return {
    title: "래미안 임장",
    aptName: "래미안 A",
    region: "서울 강남구",
    visitLabel: "2026.08 방문",
    verdict: "학군 좋고 주차 아쉬움",
    intent: "실거주",
    budgetLabel: "12억",
    summary: "채광 좋고 조용한 단지",
    risks: "주차 부족",
    weather: "맑음",
    transportation: "지하철 5분",
    scores: [
      { label: "입지", value: 80 },
      { label: "학군", value: 90 },
      { label: "교통", value: 70 },
      { label: "시설", value: 60 },
      { label: "미래가치", value: 75 },
    ],
    checks: [
      { label: "채광", rating: "좋음" },
      { label: "소음", rating: "보통" },
      { label: "주차", rating: "아쉬움" },
    ],
    pros: ["채광", "학군"],
    cons: ["주차"],
    tags: ["학군", "역세권"],
    hasLocation: true,
  };
}

function sparseSource(): NoteCardSource {
  return {
    title: "빌라 임장",
    aptName: null,
    region: "서울 마포구",
    visitLabel: null,
    verdict: null,
    intent: null,
    budgetLabel: null,
    summary: null,
    risks: null,
    weather: null,
    transportation: null,
    scores: [],
    checks: [],
    pros: [],
    cons: [],
    tags: [],
    hasLocation: false,
  };
}

test("테마 10종 · 유효 id 판정", () => {
  assert.equal(CARD_THEMES.length, 10);
  assert.ok(isValidThemeId("forest"));
  assert.ok(!isValidThemeId("nope"));
  assert.equal(getCardTheme("nope").id, "forest"); // 미상은 기본 테마
  // 모든 테마가 필수 필드를 갖는다
  for (const t of CARD_THEMES) {
    for (const k of ["bg", "ink", "sub", "accent"] as const) {
      assert.ok(t[k] && t[k].length > 0, `${t.id}.${k} 비어있음`);
    }
  }
});

test("프레임 13종 · 평균 점수 계산", () => {
  assert.equal(CARD_FRAMES.length, 13);
  assert.equal(averageScore(richSource()), 75); // (80+90+70+60+75)/5
  assert.equal(averageScore(sparseSource()), null);
});

test("available — 데이터 없으면 후보에서 빠진다(빈 장 금지)", () => {
  const rich = availableFrames(richSource()).map((f) => f.id);
  assert.ok(rich.includes("score-ring"));
  assert.ok(rich.includes("checklist"));
  const sparse = availableFrames(sparseSource()).map((f) => f.id);
  assert.ok(!sparse.includes("score-ring")); // 점수 없음
  assert.ok(!sparse.includes("checklist")); // 체크 없음
  assert.ok(sparse.includes("cover")); // 표지·마무리는 항상
  assert.ok(sparse.includes("cta"));
});

test("자동 구성 — 표지 첫 장 + 최소 5장", () => {
  const cfg = autoBuildConfig(richSource());
  assert.equal(cfg.frameIds[0], "cover");
  assert.ok(cfg.frameIds.length >= MIN_FRAMES);
  // 정보 적은 노트도 최소 장수를 맞춘다(cta 보강)
  const sparse = autoBuildConfig(sparseSource());
  assert.ok(sparse.frameIds.length >= 2); // cover + cta 최소
  assert.equal(sparse.frameIds[0], "cover");
});

test("정규화 — 표지 강제·중복/무효/불가 프레임 제거·최소장수 보강", () => {
  const src = richSource();
  // 표지 없이, 중복·무효 id 섞고, 순서 뒤집힌 입력
  const norm = normalizeConfig(
    { themeId: "midnight", frameIds: ["summary", "summary", "ghost-frame", "score-ring"] },
    src,
  );
  assert.equal(norm.frameIds[0], "cover"); // 표지 첫 장 강제
  assert.equal(norm.themeId, "midnight");
  assert.ok(!norm.frameIds.includes("ghost-frame")); // 무효 제거
  assert.equal(new Set(norm.frameIds).size, norm.frameIds.length); // 중복 없음
  assert.ok(norm.frameIds.length >= MIN_FRAMES); // 보강
});

test("정규화 — 불가 프레임(데이터 없음)은 버린다", () => {
  const norm = normalizeConfig(
    { themeId: "forest", frameIds: ["cover", "score-ring", "checklist"] },
    sparseSource(), // 점수·체크 없음
  );
  assert.ok(!norm.frameIds.includes("score-ring"));
  assert.ok(!norm.frameIds.includes("checklist"));
});

test("isConfigComplete — 최소장수·표지·유효테마", () => {
  const src = richSource();
  const good = autoBuildConfig(src);
  assert.ok(isConfigComplete(good, src));
  assert.ok(!isConfigComplete({ themeId: "forest", frameIds: ["cover", "summary"] }, src)); // 5장 미만
  assert.ok(!isConfigComplete({ themeId: "bad", frameIds: good.frameIds }, src)); // 잘못된 테마
});
