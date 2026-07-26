#!/usr/bin/env node
/**
 * Icon name 게이트.
 *
 * app/components/Icon.tsx 의 `Icon` 은 name 을 `string` 으로 받고,
 * ICON_PATHS 에도 EMOJI_MAP 에도 없는 이름은 **그 글자를 그대로** 렌더한다
 * (무손실 폴백). 이모지에는 맞는 설계지만, `name="alert"` 처럼 있지도 않은
 * 아이콘 이름을 적으면 화면에 동그란 아이콘 대신 "alert" 라는 영어 단어가
 * 뜬다 — 그리고 타입 검사는 통과한다. 실제로 그런 사례가 하나 있었다.
 *
 * 그래서 여기서 본다: 소스에 리터럴로 적힌 `<Icon name="..." />` 중
 * 알파벳/하이픈으로만 된 이름(=이모지가 아닌, 아이콘 이름을 의도한 것)이
 * ICON_PATHS 에 실제로 있는지. 변수로 넘기는 경우는 정적으로 알 수 없으므로
 * 검사 대상이 아니다.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ICON_FILE = path.join(ROOT, "app/components/Icon.tsx");

function iconKeys() {
  const src = fs.readFileSync(ICON_FILE, "utf8");
  const start = src.indexOf("ICON_PATHS: Record");
  const end = src.indexOf("EMOJI_MAP", start);
  if (start < 0 || end < 0) {
    throw new Error("[check-icon-names] Icon.tsx 에서 ICON_PATHS 구간을 찾지 못했습니다.");
  }
  const keys = new Set();
  for (const line of src.slice(start, end).split("\n")) {
    const m = /^ {2}"?([a-zA-Z0-9_-]+)"?:/.exec(line);
    if (m) keys.add(m[1]);
  }
  if (keys.size === 0) {
    throw new Error("[check-icon-names] ICON_PATHS 키를 하나도 읽지 못했습니다.");
  }
  return keys;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "coverage",
  "playwright-report",
  "test-results",
]);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") && e.name !== ".") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(p);
    } else if (/\.(tsx|ts)$/.test(e.name)) {
      yield p;
    }
  }
}

const keys = iconKeys();
const bad = [];

for (const file of walk(ROOT)) {
  if (path.resolve(file) === path.resolve(ICON_FILE)) continue;
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("<Icon")) continue;

  /* `<Icon` 부터 그 태그를 닫는 `>` 까지가 한 태그다. 그 안에 있는
     name="..." 만 본다 — 다른 컴포넌트의 name 속성을 잡지 않도록. */
  for (const m of src.matchAll(/<Icon[\s/>]/g)) {
    const open = m.index;
    const close = src.indexOf(">", open);
    if (close < 0) continue;
    const tag = src.slice(open, close + 1);
    const nm = /\bname="([A-Za-z][A-Za-z0-9_-]*)"/.exec(tag);
    if (!nm) continue; // 변수로 넘기거나 이모지인 경우 — 정적으로 판단하지 않는다.
    if (keys.has(nm[1])) continue;
    const line = src.slice(0, open).split("\n").length;
    bad.push(`${path.relative(ROOT, file)}:${line}  name="${nm[1]}"`);
  }
}

if (bad.length) {
  console.error("[check-icon-names] ICON_PATHS 에 없는 아이콘 이름:");
  for (const b of bad) console.error("  " + b);
  console.error(
    "\n이 이름들은 아이콘 대신 글자 그대로 화면에 찍힙니다. " +
      "app/components/Icon.tsx 의 ICON_PATHS 에 있는 이름으로 바꾸거나, 아이콘을 추가하세요.",
  );
  process.exit(1);
}

console.log(`[check-icon-names] OK — 리터럴 Icon name 전부 매핑됨 (아이콘 ${keys.size}종).`);
