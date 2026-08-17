import { strict as assert } from "node:assert";
import { test } from "node:test";
import { aggregateComplexRows, type ComplexBandRow } from "../../lib/imjang/aggregate";

/* 임장 가이드 단지 합산 — 구간 행을 단지 단위로 접는 규칙 검증.
   특히 "0 = 모름" 처리: 평균 가중치 제외, min/max 오염 방지. */

const row = (p: Partial<ComplexBandRow>): ComplexBandRow => ({
  name: "A단지",
  txCount: 10,
  avgKrw: 100,
  minKrw: 80,
  maxKrw: 120,
  latestYm: "202607",
  ...p,
});

test("같은 단지의 구간 행을 합산 — 거래합·가중평균·min/max·최신월", () => {
  const out = aggregateComplexRows([
    row({ txCount: 10, avgKrw: 100, minKrw: 80, maxKrw: 120, latestYm: "202605" }),
    row({ txCount: 30, avgKrw: 200, minKrw: 150, maxKrw: 260, latestYm: "202608" }),
    row({ name: "B단지", txCount: 5, avgKrw: 50, minKrw: 40, maxKrw: 60 }),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, "A단지"); // 거래 많은 순
  assert.equal(out[0].txCount, 40);
  assert.equal(out[0].avgKrw, Math.round((100 * 10 + 200 * 30) / 40)); // 175
  assert.equal(out[0].minKrw, 80);
  assert.equal(out[0].maxKrw, 260);
  assert.equal(out[0].latestYm, "202608");
  assert.equal(out[1].name, "B단지");
});

test("0(모름) 값은 평균 가중치와 min/max 를 오염시키지 않는다", () => {
  const out = aggregateComplexRows([
    row({ txCount: 10, avgKrw: 0, minKrw: 0, maxKrw: 0 }), // 가격 모름 구간
    row({ txCount: 10, avgKrw: 300, minKrw: 250, maxKrw: 350 }),
  ]);
  assert.equal(out[0].txCount, 20); // 거래 수에는 포함
  assert.equal(out[0].avgKrw, 300); // 모름 구간은 평균에서 제외
  assert.equal(out[0].minKrw, 250); // 0 이 최저가로 끼어들지 않음
  assert.equal(out[0].maxKrw, 350);
});

test("빈 이름·0건 행은 버리고, limit 만큼만 반환", () => {
  const rows: ComplexBandRow[] = [
    row({ name: "  ", txCount: 99 }),
    row({ name: "C단지", txCount: 0 }),
    ...Array.from({ length: 15 }, (_, i) => row({ name: `단지${i}`, txCount: i + 1 })),
  ];
  const out = aggregateComplexRows(rows, 10);
  assert.equal(out.length, 10);
  assert.ok(out.every((c) => c.txCount > 0));
  assert.equal(out[0].name, "단지14"); // txCount 15 가 1위
});
