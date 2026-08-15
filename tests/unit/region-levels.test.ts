import { test } from "node:test";
import assert from "node:assert/strict";
import {
  guToken,
  tierForCount,
  computeRegionLevels,
  regionLevelProgress,
  regionLevelSummary,
  REGION_TIERS,
} from "@/lib/gamification/region-levels.ts";

test("guToken 은 구/시/군 토큰을 뽑는다", () => {
  assert.equal(guToken("서울 강남구"), "강남구");
  assert.equal(guToken("고양시 덕양구"), "덕양구"); // 구가 시보다 우선
  assert.equal(guToken("성남시"), "성남시");
  assert.equal(guToken("가평군"), "가평군");
  assert.equal(guToken("  서울  송파구 "), "송파구");
  assert.equal(guToken(""), "");
});

test("tierForCount 는 구간을 정확히 가른다", () => {
  assert.equal(tierForCount(0), null);
  assert.equal(tierForCount(1)?.level, 1);
  assert.equal(tierForCount(2)?.level, 1);
  assert.equal(tierForCount(3)?.level, 2);
  assert.equal(tierForCount(5)?.level, 3);
  assert.equal(tierForCount(10)?.level, 4);
  assert.equal(tierForCount(20)?.level, 5);
  assert.equal(tierForCount(50)?.level, 5);
  // 최고 레벨은 next 가 없다
  assert.equal(tierForCount(20)?.next, null);
  // 다음 목표까지 남은 수
  assert.equal(tierForCount(1)?.next?.need, 2); // 1 → 3 까지 2건
  assert.equal(tierForCount(8)?.next?.need, 2); // 8 → 10 까지 2건
});

test("computeRegionLevels 는 구별로 세고 레벨을 매긴다", () => {
  const notes = [
    { region: "서울 강남구" },
    { region: "강남구" }, // 같은 버킷
    { region: "서울 강남구" },
    { region: "서울 송파구" },
    { region: "" }, // 지역 없음 → 버림
  ];
  const levels = computeRegionLevels(notes);
  assert.equal(levels.length, 2);
  // 강남구 3건 → Lv2, 맨 앞(많은 순)
  assert.equal(levels[0].region, "강남구");
  assert.equal(levels[0].count, 3);
  assert.equal(levels[0].level, 2);
  // 송파구 1건 → Lv1
  assert.equal(levels[1].region, "송파구");
  assert.equal(levels[1].count, 1);
  assert.equal(levels[1].level, 1);
});

test("computeRegionLevels 는 limit 로 상위 N개만", () => {
  const notes = Array.from({ length: 10 }, (_, i) => ({ region: `${i}구` }));
  assert.equal(computeRegionLevels(notes, 3).length, 3);
});

test("regionLevelProgress 는 현재 구간 진행률(0~100)", () => {
  const [r] = computeRegionLevels([{ region: "강남구" }]); // 1건, Lv1(min1) → 다음 Lv2(min3)
  // (1-1)/(3-1) = 0%
  assert.equal(regionLevelProgress(r), 0);
  const [r2] = computeRegionLevels([
    { region: "강남구" },
    { region: "강남구" },
  ]); // 2건 → (2-1)/(3-1)=50%
  assert.equal(regionLevelProgress(r2), 50);
  // 최고 레벨은 100
  const many = computeRegionLevels(
    Array.from({ length: 25 }, () => ({ region: "강남구" })),
  );
  assert.equal(regionLevelProgress(many[0]), 100);
});

test("regionLevelSummary 는 지역 수·최고 레벨을 낸다", () => {
  const levels = computeRegionLevels([
    ...Array.from({ length: 5 }, () => ({ region: "강남구" })), // Lv3
    { region: "송파구" }, // Lv1
  ]);
  const s = regionLevelSummary(levels);
  assert.equal(s.regionCount, 2);
  assert.equal(s.topLevel, 3);
  assert.equal(s.topLabel, "단골 임장러");
  // 빈 목록
  const empty = regionLevelSummary([]);
  assert.equal(empty.regionCount, 0);
  assert.equal(empty.topLevel, 0);
});

test("REGION_TIERS 는 5단계·오름차순", () => {
  assert.equal(REGION_TIERS.length, 5);
  for (let i = 1; i < REGION_TIERS.length; i += 1) {
    assert.ok(REGION_TIERS[i].min > REGION_TIERS[i - 1].min);
  }
});
