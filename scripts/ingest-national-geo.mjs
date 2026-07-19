#!/usr/bin/env node
/**
 * 전국 geo CSV → public-data geo-etl 캐시 적재
 * 실행: node scripts/ingest-national-geo.mjs [csvPath]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const defaultCsv = path.join(root, "data", "public-data-geo", "sample-national-geo.csv");
const cacheDir = path.join(root, "data", "public-data-geo-cache");

function parseSimpleCsvRows(csv, kind) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (key) => headers.indexOf(key);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const name = cols[idx("name")] ?? cols[0];
    const district = cols[idx("district")] ?? cols[1];
    if (!name || !district) continue;
    const latRaw = cols[idx("lat")];
    const lngRaw = cols[idx("lng")];
    const lat = latRaw ? Number.parseFloat(latRaw) : undefined;
    const lng = lngRaw ? Number.parseFloat(lngRaw) : undefined;
    rows.push({
      name,
      district: district.includes("구") ? district : `${district}구`,
      city: cols[idx("city")] || undefined,
      address: cols[idx("address")] || undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      category: cols[idx("category")] || kind,
    });
  }
  return rows;
}

function geoEtlCacheKey(kind, district) {
  const d = district?.trim().replace(/구$/, "") || "all";
  return `geo-etl:${kind}:${d}`;
}

function writeFileCache(kind, district, rows) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const d = district?.trim().replace(/구$/, "") || "all";
  const fp = path.join(cacheDir, `${kind}-${d}.json`);
  fs.writeFileSync(fp, JSON.stringify(rows, null, 2));
  console.log(`  ✅ ${fp} (${rows.length} rows)`);
}

function main() {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultCsv;
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }
  const csv = fs.readFileSync(csvPath, "utf8");
  const allRows = parseSimpleCsvRows(csv, "mixed");

  const byKind = {
    parking: allRows.filter((r) => r.category === "parking"),
    park: allRows.filter((r) => r.category === "park"),
    childcare: allRows.filter((r) => r.category === "childcare"),
  };

  console.log(`\nIngesting ${csvPath}\n`);
  for (const [kind, rows] of Object.entries(byKind)) {
    if (!rows.length) continue;
    writeFileCache(kind, undefined, rows);
    const districts = [...new Set(rows.map((r) => r.district))];
    for (const district of districts) {
      const filtered = rows.filter((r) => r.district === district);
      writeFileCache(kind, district, filtered);
      console.log(`     key: ${geoEtlCacheKey(kind, district)}`);
    }
  }
  console.log("\nDone. Restart dev server or call national adapters to read cache.\n");
}

main();
