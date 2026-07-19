#!/usr/bin/env node
/** UTF-8 안전 — Figma primary `#3182F6` 토큰 통일 (#1F6BFF 레거시 제거) */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPLACEMENTS = [
  [/#1F6BFF/gi, "#3182F6"],
  [/#1858d4/gi, "#1B64DA"],
  [/#EAF2FF/gi, "#EEF4FF"],
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if ([".ts", ".tsx"].includes(extname(name))) files.push(p);
  }
  return files;
}

let changed = 0;
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  let next = src;
  for (const [re, to] of REPLACEMENTS) next = next.replace(re, to);
  if (next !== src) {
    writeFileSync(file, next, "utf8");
    changed++;
  }
}
console.log(`figma-token-sync: ${changed} files updated`);
