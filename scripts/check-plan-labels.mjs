#!/usr/bin/env node
/**
 * 플랜 표시명 단일 출처 게이트.
 *
 * 왜(2026-08-26 실사): 같은 플랜 이름이 코드 안에 여섯 벌 있었고 서로 달랐다.
 * 요금제에서 "플러스"를 사고 마이페이지에서 "PRO"를 보는 상태였다. 한 번 모아
 * 놓아도, 새 화면을 만들 때 그 자리에서 맵을 또 만들면 즉시 다시 갈라진다.
 *
 * 그래서 **지역 맵 자체를 금지**한다. 플랜 이름이 필요하면
 * lib/subscriptions/labels.ts 의 planLabel()/planBadgeLabel() 을 쓴다.
 *
 * 사용: node scripts/check-plan-labels.mjs · npm run check:plan-labels
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TAG = "[check-plan-labels]";
const SKIP = new Set(["node_modules", ".next", ".git", "public", "coverage"]);
/** 단일 출처 자신과, 이름이 아니라 정의를 담는 파일 */
const ALLOW = new Set([
  "lib/subscriptions/labels.ts",
  "lib/subscriptions/plans.ts",          // 상품 정의(name/tagline) — 카탈로그 자체
  "app/subscription/PlanCards.tsx",      // 카드 표시명·CTA 문구 — 요금제 화면의 원본
  "lib/subscriptions/billing-periods.ts",// 주기 라벨(주간권 등)
  "scripts/check-plan-labels.mjs",
  "scripts/check-toss-review-freeze.mjs",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** 주석은 코드가 아니다 — 줄 번호는 살리고 내용만 지운다. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

const files = walk(join(ROOT, "app"))
  .concat(walk(join(ROOT, "lib")))
  .concat(walk(join(ROOT, "components")));

/* "pro" 또는 "expert" 키에 한글/영문 플랜명을 직접 박은 객체 리터럴 */
const LOCAL_MAP = /\b(pro|expert)\s*:\s*"(?:플러스|프로[^"]*|PRO|EXPERT|베이직)"/;

const hits = [];
for (const f of files) {
  const rel = relative(ROOT, f).replaceAll("\\", "/");
  if (ALLOW.has(rel)) continue;
  const src = stripComments(readFileSync(f, "utf8"));
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (LOCAL_MAP.test(lines[i])) hits.push({ rel, line: i + 1, text: lines[i].trim().slice(0, 90) });
  }
}

if (hits.length) {
  console.error(`${TAG} 플랜 이름을 파일 안에서 직접 정의한 곳이 ${hits.length}곳 있습니다.`);
  for (const h of hits) console.error(`  ✗ ${h.rel}:${h.line}  ${h.text}`);
  console.error("  → lib/subscriptions/labels.ts 의 planLabel() / planBadgeLabel() 을 쓰세요.");
  console.error("     이름이 갈라지면 사용자는 자기가 산 상품이 그건지 확인할 수 없습니다.");
  process.exit(1);
}
console.log(`${TAG} OK — 지역 플랜명 맵 0곳 (검사 ${files.length}파일)`);
