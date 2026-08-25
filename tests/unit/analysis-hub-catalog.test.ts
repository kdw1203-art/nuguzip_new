import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AI_TOOL_IDS, CORE_AI_TOOL_IDS } from "../../lib/ai/ai-tools.ts";
import { TOOL_IDENTITIES } from "../../lib/ai/tool-identity.ts";
import { sparklinePath } from "../../app/analysis/sparkline-path.ts";
import {
  AI_TOOL_COUNT,
  HUB_TOOLS,
  LIVE_TOOLS,
  MARKET_LIVE,
  RECORD_LIVE,
  SIM_TOOLS,
  TIERS,
  WORKBENCH_CORE,
  WORKBENCH_ICONS,
  WORKBENCH_MORE,
  workbenchCard,
} from "../../app/analysis/tool-catalog.ts";

/* ============================================================
   분석 허브 리디자인 회귀 잠금 (UI-01 ~ UI-10, 2026-08-25)

   소유자 피드백("뭐가 중요한지, 어떤 게 어느 기능인지 모르겠다")의 실제 원인은
   이름 중복 5쌍이었다. 이름은 코드 어디서든 쉽게 되돌아온다 — 그래서 규칙을
   테스트로 잠근다. 아이콘도 마찬가지다: 존재하지 않는 아이콘 이름을 쓰면
   화면에는 **빈 자리**가 나고 빌드는 통과한다(런타임 조용한 실패).
   ============================================================ */

const ICON_SRC = fs.readFileSync(
  path.join(process.cwd(), "app/components/Icon.tsx"),
  "utf8",
);
const ICON_NAMES = new Set(
  [...ICON_SRC.slice(ICON_SRC.indexOf("ICON_PATHS")).matchAll(
    /^\s*"?([a-zA-Z0-9_-]+)"?\s*:/gm,
  )].map((m) => m[1]),
);

test("UI-02 — 워크벤치 제목과 허브 도구 제목이 하나도 겹치지 않는다", () => {
  const workbench = AI_TOOL_IDS.map((id) => TOOL_IDENTITIES[id].title);
  const hub = HUB_TOOLS.map((t) => t.title);
  const dup = workbench.filter((w) => hub.includes(w));
  assert.deepEqual(
    dup,
    [],
    `제목 중복: ${dup.join(", ")} — 워크벤치는 '이 단지', 허브 도구는 대상(지역·전국·내 기록)을 제목에 넣는다`,
  );
});

test("UI-02 — 제목은 각 목록 안에서도 유일하다", () => {
  const workbench = AI_TOOL_IDS.map((id) => TOOL_IDENTITIES[id].title);
  assert.equal(new Set(workbench).size, workbench.length, "워크벤치 제목 중복");
  const hub = HUB_TOOLS.map((t) => t.title);
  assert.equal(new Set(hub).size, hub.length, "허브 도구 제목 중복");
});

test("UI-03 — 워크벤치는 CORE + MORE 로 정확히 한 번씩 덮인다", () => {
  const all = [...WORKBENCH_CORE, ...WORKBENCH_MORE];
  assert.equal(all.length, AI_TOOL_IDS.length);
  assert.equal(new Set(all).size, all.length, "중복 노출");
  assert.deepEqual([...all].sort(), [...AI_TOOL_IDS].sort(), "누락된 도구");
  assert.deepEqual([...WORKBENCH_CORE], [...CORE_AI_TOOL_IDS]);
  assert.equal(AI_TOOL_COUNT, AI_TOOL_IDS.length);
});

test("UI-06 — 카드 아이콘 이름이 전부 Icon.tsx 에 실존한다", () => {
  const missing: string[] = [];
  for (const t of HUB_TOOLS) if (!ICON_NAMES.has(t.icon)) missing.push(t.icon);
  for (const id of AI_TOOL_IDS) {
    const n = WORKBENCH_ICONS[id];
    if (!ICON_NAMES.has(n)) missing.push(`${id}:${n}`);
  }
  for (const tier of Object.values(TIERS)) {
    // 계열 아이콘 클래스는 토큰만 쓴다 — raw hex 가 들어오면 대비 보증 밖이다
    assert.ok(
      !/#[0-9a-fA-F]{3,8}/.test(tier.iconClass + tier.sparkClass),
      `계열 ${tier.id} 색에 raw hex`,
    );
  }
  assert.deepEqual(missing, [], `없는 아이콘: ${missing.join(", ")}`);
});

test("UI-06 — 이모지 아이콘이 카탈로그에 남아 있지 않다", () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  for (const t of HUB_TOOLS) {
    assert.ok(!emoji.test(t.icon), `${t.title} 아이콘이 이모지다: ${t.icon}`);
  }
});

test("UI-04 — 실데이터 도구와 예시 계산 도구가 완전히 갈린다", () => {
  assert.ok(SIM_TOOLS.length > 0 && LIVE_TOOLS.length > 0);
  assert.ok(SIM_TOOLS.every((t) => t.sim === true));
  assert.ok(LIVE_TOOLS.every((t) => !t.sim));
  assert.equal(SIM_TOOLS.length + LIVE_TOOLS.length, HUB_TOOLS.length);
  assert.equal(MARKET_LIVE.length + RECORD_LIVE.length, LIVE_TOOLS.length);
});

test("UI-01 — 모든 도구가 계열 3개 중 하나에 속하고 href 는 유일하다", () => {
  const hrefs = HUB_TOOLS.map((t) => t.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "href 중복");
  for (const t of HUB_TOOLS) {
    assert.ok(TIERS[t.tier], `${t.title} 계열 미상`);
    assert.ok(t.href.startsWith("/"), `${t.title} 내부 링크 아님`);
  }
});

test("워크벤치 카드 링크는 /analysis/ai/{id} 를 그대로 쓴다", () => {
  for (const id of AI_TOOL_IDS) {
    const c = workbenchCard(id);
    assert.equal(c.href, `/analysis/ai/${id}`);
    assert.ok(c.title.length > 0 && c.desc.length > 0);
  }
});

/* ---------- UI-09 스파크라인 — "없으면 안 그린다" 정직성 규칙 ---------- */

test("UI-09 — 점이 2개 미만이면 선을 그리지 않는다(빈 데이터를 선으로 위장 금지)", () => {
  assert.equal(sparklinePath([]), null);
  assert.equal(sparklinePath([42]), null);
  assert.equal(sparklinePath([Number.NaN, Number.NaN]), null);
  assert.equal(sparklinePath([1, Number.POSITIVE_INFINITY]), null);
});

test("UI-09 — 좌표가 전부 뷰박스 안에 들어온다", () => {
  const g = sparklinePath([1, 3, 2, 5, 4], 96, 26);
  assert.ok(g);
  const ys = [...g.line.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  const xs = [...g.line.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]));
  assert.ok(ys.every((y) => y >= 0 && y <= 26), `y 벗어남: ${ys.join(",")}`);
  assert.ok(xs.every((x) => x >= 0 && x <= 96), `x 벗어남: ${xs.join(",")}`);
  assert.equal(xs[0], 0);
  assert.equal(xs[xs.length - 1], 96);
  assert.deepEqual([...g.last], [xs[xs.length - 1], ys[ys.length - 1]]);
});

test("UI-09 — 전 구간 같은 값이면 가운데 수평선으로 눕는다(0 나눗셈 없음)", () => {
  const g = sparklinePath([50, 50, 50], 96, 26);
  assert.ok(g);
  const ys = [...g.line.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys.every((y) => y === 13), `수평선이 아니다: ${ys.join(",")}`);
});

test("UI-09 — 값이 클수록 위로 간다(부호가 뒤집히지 않는다)", () => {
  const g = sparklinePath([1, 2, 3], 90, 30);
  assert.ok(g);
  const ys = [...g.line.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys[0] > ys[1] && ys[1] > ys[2], `상승인데 내려간다: ${ys.join(",")}`);
});
