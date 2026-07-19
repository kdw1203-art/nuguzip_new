#!/usr/bin/env node
/**
 * Validates public-data-rankings CSV files exist and prints mtime.
 * Usage: node scripts/sync-public-data-rankings.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rankingsDir = path.join(__dirname, "..", "data", "public-data-rankings");

const EXPECTED = [
  "file-top10-202604.csv",
  "file-top20-2026q1.csv",
  "file-top20-alltime.csv",
  "openapi-top10-202604.csv",
  "openapi-top20-2026q1.csv",
  "openapi-top20-alltime.csv",
];

let ok = true;

console.log(`Rankings dir: ${rankingsDir}\n`);

for (const filename of EXPECTED) {
  const filePath = path.join(rankingsDir, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING  ${filename}`);
    ok = false;
    continue;
  }
  const stat = fs.statSync(filePath);
  console.log(`OK       ${filename}  mtime=${stat.mtime.toISOString()}  size=${stat.size}`);
}

if (!ok) {
  process.exit(1);
}

console.log("\nAll ranking CSV files present.");
