#!/usr/bin/env node
/**
 * 번들 공공데이터 CSV 존재·행 수 검증 (CI/로컬 smoke).
 * 사용: node my-app/scripts/seed-public-data-bundled.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirs = [
  path.join(root, "data", "public-data-rankings"),
  path.join(root, "data", "public-data-geo"),
];

let ok = true;
for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    console.warn("[seed-public-data] missing dir:", dir);
    ok = false;
    continue;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".csv"));
  console.log(`[seed-public-data] ${path.basename(dir)}: ${files.length} csv`);
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/).filter(Boolean);
    console.log(`  - ${f}: ${Math.max(0, lines.length - 1)} rows`);
    if (lines.length < 2) ok = false;
  }
}

const archive = path.join(root, "data", "public-data-archive");
if (fs.existsSync(archive)) {
  const extra = fs.readdirSync(archive);
  console.log(`[seed-public-data] archive: ${extra.length} files`);
} else {
  console.log("[seed-public-data] archive dir optional (public-data-archive/)");
}

process.exit(ok ? 0 : 1);
