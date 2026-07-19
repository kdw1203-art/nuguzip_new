// Dev-only: dump R-ONE OpenAPI 통계코드 .xls so we can curate stat-codes.ts.
// Usage: node ./scripts/dump-stat-codes.mjs "C:\\path\\to\\OpenAPI_통계코드.xls"
import pkg from "xlsx";
const XLSX = pkg;

const file = process.argv[2];
if (!file) {
  console.error("provide path to .xls");
  process.exit(1);
}
import { writeFileSync } from "node:fs";

const wb = XLSX.readFile(file);
const out = [];
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 3) continue;
    out.push({ no: r[0], name: String(r[1] ?? ""), code: String(r[2] ?? "") });
  }
}
writeFileSync("./scripts/stat-codes-dump.json", JSON.stringify(out, null, 2), "utf8");
console.log(`wrote ${out.length} rows`);
