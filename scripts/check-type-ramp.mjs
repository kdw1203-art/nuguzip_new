#!/usr/bin/env node
/**
 * 타입 램프 게이트 — 글자 크기가 램프(9·11·13·15·19·21·24·28)를 벗어났는지 본다.
 *
 * 왜 필요한가: 색은 check-contrast-tokens 가 잡아 주는데 크기는 아무도 안 봤다.
 * 그 사이 /notifications 한 화면 안에서만 12 / 10.5 / 10 세 크기가 섞여,
 * 한 칸도 안 되는 차이로 제목·본문·메타가 붙어 버렸다(무엇이 제목인지 안 보임).
 *
 * 한 번에 다 고칠 수는 없다(현재 이탈이 1천 곳 단위다). 그래서 **래칫**으로 둔다:
 *   · 파일별 이탈 수를 baseline 에 적어 두고
 *   · 늘어나면 실패, 줄면 baseline 을 낮추라고 알린다
 * 새 코드는 램프를 지키게 강제하면서, 기존 빚은 순서대로 갚을 수 있다.
 *
 *   node scripts/check-type-ramp.mjs            # 게이트
 *   node scripts/check-type-ramp.mjs --report   # 파일별 현황(상위 30)
 *   node scripts/check-type-ramp.mjs --write    # baseline 갱신(줄어든 것만)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const BASELINE = join(ROOT, "scripts", "type-ramp-baseline.json");
const RAMP = new Set([9, 11, 13, 15, 19, 21, 24, 28]);

/* Tailwind 기본 스케일 → px. 램프에 있는 값(text-2xl=24)은 통과한다. */
const TW = {
  "text-xs": 12, "text-sm": 14, "text-base": 16, "text-lg": 18,
  "text-xl": 20, "text-2xl": 24, "text-3xl": 30, "text-4xl": 36,
  "text-5xl": 48, "text-6xl": 60, "text-7xl": 72, "text-8xl": 96, "text-9xl": 128,
};

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "public", "coverage"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(p);
  }
  return out;
}

/** 한 파일의 램프 이탈 목록.
 *  CSS 도 본다 — 예전엔 TSX 클래스만 봐서 .map-chip(12px) · .seg>button(11.5px)
 *  처럼 **여러 화면이 공유하는** 크기가 그대로 통과했다. 지도·허브·KPI 가 한꺼번에
 *  램프를 벗어나 있었는데 게이트는 초록불이었다. */
export function offRampHits(rawSrc, isCss = false) {
  /* 주석은 코드가 아니다. globals.css 의 설명 주석에 "text-xs" 라고 적혀 있다는
     이유로 이탈로 세면 게이트가 거짓말을 한다(실제로 그렇게 한 번 울렸다).
     줄 번호는 살려야 하므로 지우지 않고 같은 길이의 공백으로 바꾼다. */
  const src = rawSrc.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  const hits = [];
  const push = (px, token, idx) => {
    if (RAMP.has(px)) return;
    const line = src.slice(0, idx).split("\n").length;
    hits.push({ px, token, line });
  };
  // text-[13.5px] / text-[10px]
  for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    push(parseFloat(m[1]), m[0], m.index);
  }
  if (isCss) {
    // CSS: font-size: 12px  (var(--fs-*) 는 램프 그 자체라 통과)
    for (const m of src.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      push(parseFloat(m[1]), m[0].trim(), m.index);
    }
    // @apply text-xs 처럼 CSS 안에서 유틸을 끌어 쓰는 경우
    for (const m of src.matchAll(/@apply[^;}]*/g)) {
      for (const t of m[0].matchAll(/(?<![\w-])(text-(?:xs|sm|base|lg|xl|\d?xl))(?![\w-])/g)) {
        const px = TW[t[1]];
        if (px !== undefined) push(px, t[1], m.index + t.index);
      }
    }
    return hits;
  }
  // TSX/TS: text-xs · text-sm · … (클래스 문자열 안에서만)
  for (const m of src.matchAll(/(?<![\w-])(text-(?:xs|sm|base|lg|xl|\d?xl))(?![\w-])/g)) {
    const px = TW[m[1]];
    if (px === undefined) continue;
    push(px, m[1], m.index);
  }
  return hits;
}

/* 이 파일을 import 해도 게이트가 돌지 않게 한다 — 테스트는 offRampHits 만 쓴다.
   (예전엔 import 만 해도 게이트가 돌아 테스트 출력에 게이트 로그가 섞였다.) */
const invokedDirectly = Boolean(
  process.argv[1] && process.argv[1].endsWith("check-type-ramp.mjs"),
);

const files = invokedDirectly ? walk(join(ROOT, "app")).concat(
  existsSync(join(ROOT, "components")) ? walk(join(ROOT, "components")) : [],
) : [];
if (invokedDirectly) {

const current = {};
let total = 0;
for (const f of files) {
  const hits = offRampHits(readFileSync(f, "utf8"), f.endsWith(".css"));
  if (!hits.length) continue;
  const key = relative(ROOT, f).replaceAll("\\", "/");
  current[key] = hits.length;
  total += hits.length;
}

const mode = process.argv.includes("--report")
  ? "report"
  : process.argv.includes("--write")
    ? "write"
    : "gate";

if (mode === "report") {
  const rows = Object.entries(current).sort((a, b) => b[1] - a[1]);
  console.log(`[check-type-ramp] 램프 이탈 ${total}곳 · 파일 ${rows.length}개`);
  console.log(`[check-type-ramp] 램프: 9 · 11 · 13 · 15 · 19 · 21 · 24 · 28 px`);
  for (const [f, n] of rows.slice(0, 30)) console.log(`  ${String(n).padStart(4)}  ${f}`);
  if (rows.length > 30) console.log(`  … 외 ${rows.length - 30}개 파일`);
  process.exit(0);
}

const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, "utf8"))
  : {};

if (mode === "write") {
  /* 늘어난 값은 쓰지 않는다 — baseline 은 내려가기만 해야 래칫이 된다. */
  const next = {};
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const k of keys) {
    const cur = current[k] ?? 0;
    const base = baseline[k] ?? Infinity;
    if (cur === 0) continue;
    next[k] = Math.min(cur, base === Infinity ? cur : base);
  }
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");
  const sum = Object.values(next).reduce((a, b) => a + b, 0);
  console.log(`[check-type-ramp] baseline 갱신 — ${Object.keys(next).length}개 파일 · ${sum}곳`);
  process.exit(0);
}

const grew = [];
const shrank = [];
for (const [f, n] of Object.entries(current)) {
  const b = baseline[f] ?? 0;
  if (n > b) grew.push({ f, n, b });
  else if (n < b) shrank.push({ f, n, b });
}
for (const f of Object.keys(baseline)) {
  if (!(f in current)) shrank.push({ f, n: 0, b: baseline[f] });
}

if (grew.length) {
  console.error("[check-type-ramp] 타입 램프 이탈이 늘었습니다.");
  console.error("  램프: 9 · 11 · 13 · 15 · 19 · 21 · 24 px (유틸: t-caption·t-sub·t-body·t-section·t-title·t-display)");
  for (const g of grew) {
    console.error(`  ✗ ${g.f} — ${g.b} → ${g.n}`);
    const hits = offRampHits(readFileSync(join(ROOT, g.f), "utf8"), g.f.endsWith(".css"));
    for (const h of hits.slice(0, 6)) console.error(`      L${h.line}  ${h.token} (${h.px}px)`);
  }
  console.error("  새로 쓰는 코드는 램프 유틸을 쓰세요. 의도한 증가라면 --write 로 baseline 을 갱신합니다.");
  process.exit(1);
}

const sumBase = Object.values(baseline).reduce((a, b) => a + b, 0);
console.log(`[check-type-ramp] OK — 이탈 ${total}곳 (baseline ${sumBase}곳, 증가 0)`);
if (shrank.length) {
  const saved = shrank.reduce((a, s) => a + (s.b - s.n), 0);
  console.log(`[check-type-ramp] ${shrank.length}개 파일에서 ${saved}곳 줄었습니다 — 'npm run check:type-ramp -- --write' 로 baseline 을 내리세요.`);
}
}
