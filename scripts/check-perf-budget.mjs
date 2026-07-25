#!/usr/bin/env node
/**
 * G8 — 성능 예산 게이트 (First Load JS)
 * 사용: npm run build && node scripts/check-perf-budget.mjs
 *
 * 왜 Lighthouse 가 아니라 번들 크기인가:
 * Lighthouse 점수는 실행 머신의 CPU·네트워크에 따라 같은 커밋에서도 10점씩 흔들린다.
 * CI 게이트로 쓰면 "코드는 그대로인데 오늘은 실패" 가 반복되고, 그러면 사람들은
 * 게이트를 무시하게 된다. 반면 라우트별 First Load JS 는 빌드 산출물에서 바이트로
 * 확정되는 값이라 같은 커밋이면 항상 같다. 회귀 방지에는 이쪽이 맞다.
 * (실제 사용자 체감은 Vercel Speed Insights 의 실사용자 지표로 따로 본다.)
 *
 * First Load JS = 그 라우트를 처음 열 때 받아야 하는 JS 총합
 *               = 공용 청크(webpack/main-app/framework) + 라우트 전용 청크.
 * next build 출력의 "First Load JS" 와 같은 정의로 계산한다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const NEXT_DIR = path.join(ROOT, ".next");

/* ── 예산 ────────────────────────────────────────────────
   숫자는 목표치가 아니라 **측정값에서 뽑은 상한**이다. 2026-07-25 커밋 기준으로
   실제로 재보니 라우트 최대 176.9KB(/reset-password), 공용 번들 100KB 였고,
   거기에 약 7~15% 여유만 얹었다.

   처음엔 260/180 으로 적었다가 고쳤다. 최댓값이 177KB 인데 상한이 260KB 면
   47% 부풀어도 통과한다 — 그건 게이트가 아니라 게이트처럼 생긴 장식이다.
   예산은 "지금보다 나빠지면 걸린다"가 성립할 만큼 붙어 있어야 한다.
   크기를 줄이는 건 이 게이트의 일이 아니라 별도 작업이다. */
const BUDGET = {
  /** 라우트 하나가 처음 로드할 때 받는 JS (gzip) — 현재 최대 176.9KB */
  routeFirstLoadKb: 190,
  /** 모든 라우트가 공유하는 공용 청크 (gzip) — 현재 100KB. 여기가 커지면 전 페이지가 함께 느려진다 */
  sharedKb: 115,
};

if (!fs.existsSync(NEXT_DIR)) {
  console.error("✗ .next 가 없습니다. 먼저 `npm run build` 를 실행하세요.");
  process.exit(1);
}

const manifestPath = path.join(NEXT_DIR, "app-build-manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("✗ .next/app-build-manifest.json 이 없습니다. 빌드가 끝나지 않았을 수 있습니다.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const pages = manifest.pages ?? {};
const routes = Object.keys(pages);
if (routes.length === 0) {
  console.error("✗ app-build-manifest.json 에 라우트가 없습니다.");
  process.exit(1);
}

/** 청크 실제 gzip 크기 (브라우저가 받는 바이트) — 한 번 재면 캐시 */
const sizeCache = new Map();
const missingChunks = new Set();
function gzipSize(rel) {
  if (sizeCache.has(rel)) return sizeCache.get(rel);
  const abs = path.join(NEXT_DIR, rel);
  let size = 0;
  if (fs.existsSync(abs)) {
    size = zlib.gzipSync(fs.readFileSync(abs), { level: 9 }).length;
  } else {
    /* 없는 청크를 0 으로 세면 예산이 조용히 통과된다. 사실을 남기고 실패시킨다. */
    missingChunks.add(rel);
  }
  sizeCache.set(rel, size);
  return size;
}

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

/* 모든 라우트에 공통으로 들어가는 청크 = 공용 번들 */
const chunkRouteCount = new Map();
for (const r of routes) {
  for (const c of new Set(pages[r])) {
    chunkRouteCount.set(c, (chunkRouteCount.get(c) ?? 0) + 1);
  }
}
const sharedChunks = [...chunkRouteCount.entries()]
  .filter(([, n]) => n === routes.length)
  .map(([c]) => c);
const sharedBytes = sharedChunks.reduce((sum, c) => sum + gzipSize(c), 0);

const measured = routes
  .map((r) => {
    const bytes = [...new Set(pages[r])].reduce((sum, c) => sum + gzipSize(c), 0);
    return { route: r.replace(/\/page$/, "") || "/", bytes };
  })
  .sort((a, b) => b.bytes - a.bytes);

// ── 출력 ────────────────────────────────────────────────
console.log("\n=== 성능 예산 (First Load JS, gzip) ===\n");
console.log(`라우트 ${routes.length}개 · 공용 청크 ${sharedChunks.length}개`);
console.log(
  `공용 번들 ${kb(sharedBytes)}KB / 예산 ${BUDGET.sharedKb}KB`,
);
console.log("\n무거운 라우트 10개:");
console.log("| 라우트 | First Load JS |");
console.log("|--------|---------------|");
for (const m of measured.slice(0, 10)) {
  console.log(`| ${m.route} | ${kb(m.bytes)}KB |`);
}

const over = measured.filter((m) => m.bytes / 1024 > BUDGET.routeFirstLoadKb);
const problems = [];

if (missingChunks.size > 0) {
  problems.push(
    `빌드 산출물에 없는 청크 ${missingChunks.size}개 — 크기를 잴 수 없어 예산 판정이 무의미합니다: ${[...missingChunks].slice(0, 3).join(", ")}`,
  );
}
if (sharedBytes / 1024 > BUDGET.sharedKb) {
  problems.push(
    `공용 번들 ${kb(sharedBytes)}KB > 예산 ${BUDGET.sharedKb}KB — 모든 페이지가 함께 느려집니다.`,
  );
}
for (const m of over) {
  problems.push(`${m.route} ${kb(m.bytes)}KB > 예산 ${BUDGET.routeFirstLoadKb}KB`);
}

console.log("");
if (problems.length === 0) {
  console.log(
    `✓ 예산 통과 — 최대 ${kb(measured[0].bytes)}KB (${measured[0].route}) / 예산 ${BUDGET.routeFirstLoadKb}KB\n`,
  );
  process.exit(0);
}

console.log("✗ 성능 예산 초과:");
for (const p of problems) console.log(`  - ${p}`);
console.log(
  "\n예산을 올리기 전에 먼저 확인: 서버 컴포넌트로 옮길 수 있는가 · next/dynamic 으로 미룰 수 있는가 · 라이브러리가 전체 import 되고 있지 않은가\n",
);
process.exit(1);
