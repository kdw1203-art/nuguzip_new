/**
 * 국토부 아파트 매매 실거래가 CSV 배치 임포트
 *
 * 사용법:
 *   MOLIT_CSV=./data/apt_sale_202506.csv \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/import-molit-csv.mjs
 *
 * CSV 형식 (국토부 공공데이터 포털 다운로드 기준):
 *   시군구,번지,본번,부번,단지명,전용면적(㎡),계약년월,계약일,거래금액(만원),층,건축년도,도로명
 *
 * 또는 환경변수 없이 대화형:
 *   node scripts/import-molit-csv.mjs --file=./apt_sale.csv --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { createReadStream } from "fs";
import { parse } from "csv-parse";
import { existsSync } from "fs";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const fileArg = args.find((a) => a.startsWith("--file="))?.replace("--file=", "");

const CSV_FILE = fileArg ?? process.env.MOLIT_CSV;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!CSV_FILE || !existsSync(CSV_FILE)) {
  console.error("❌  CSV 파일이 없습니다. MOLIT_CSV 환경변수 또는 --file= 인수를 지정하세요.");
  process.exit(1);
}
if (!isDryRun && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error("❌  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const sb = isDryRun ? null : createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 월별 단지 집계 맵 ─────────────────────────────────────────────────
// key: "${복합단지명}|${yyyymm}"  →  { sum, min, max, cnt, district }
const aggMap = new Map();

function toSlug(name, district) {
  return `${district}-${name}`.replace(/\s+/g, "-").replace(/[^가-힣a-zA-Z0-9-]/g, "").toLowerCase().slice(0, 80);
}

let totalRows = 0;
let skippedRows = 0;

async function processCSV() {
  const parser = createReadStream(CSV_FILE).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true, // 국토부 CSV는 UTF-8 BOM
    })
  );

  for await (const row of parser) {
    totalRows++;
    const aptName = row["단지명"] ?? row["아파트"];
    const district = row["시군구"] ?? row["지역코드"];
    const areaStr = row["전용면적(㎡)"] ?? row["전용면적"];
    const yyyymm = (row["계약년월"] ?? "").replace(/[-\/\s]/g, "").slice(0, 6);
    const priceStr = (row["거래금액(만원)"] ?? row["거래금액"] ?? "").replace(/,/g, "");

    if (!aptName || !district || !yyyymm || !priceStr) {
      skippedRows++;
      continue;
    }

    const manwon = Number(priceStr);
    if (!Number.isFinite(manwon) || manwon <= 0) { skippedRows++; continue; }

    const key = `${toSlug(aptName, district)}|${yyyymm}`;
    const cur = aggMap.get(key) ?? { name: aptName, district, yyyymm, sum: 0, min: Infinity, max: -Infinity, cnt: 0 };
    cur.sum += manwon;
    cur.min = Math.min(cur.min, manwon);
    cur.max = Math.max(cur.max, manwon);
    cur.cnt++;
    aggMap.set(key, cur);
  }
}

async function upsertToSupabase() {
  const rows = [];
  for (const [key, v] of aggMap) {
    const complexId = key.split("|")[0];
    rows.push({
      complex_id: complexId,
      yyyymm: v.yyyymm,
      area_m2: null,
      avg_manwon: Math.round(v.sum / v.cnt),
      min_manwon: v.min,
      max_manwon: v.max,
      deal_count: v.cnt,
      source: "molit-csv",
    });
  }

  console.log(`📊  집계 결과: ${rows.length}개 단지-월 레코드`);
  if (isDryRun) {
    console.log("🔍  dry-run — DB 저장 생략. 처음 5개 샘플:");
    console.table(rows.slice(0, 5));
    return;
  }

  // complexes 테이블에 없는 단지는 먼저 stub으로 추가
  const uniqueComplexIds = [...new Set(rows.map((r) => r.complex_id))];
  const { data: existing } = await sb.from("complexes").select("id").in("id", uniqueComplexIds);
  const existingIds = new Set((existing ?? []).map((r) => r.id));

  const stubs = [];
  for (const [key, v] of aggMap) {
    const complexId = key.split("|")[0];
    if (!existingIds.has(complexId)) {
      stubs.push({ id: complexId, name: v.name, district: v.district, city: "", building_type: "아파트" });
    }
  }

  if (stubs.length > 0) {
    const { error } = await sb.from("complexes").upsert(stubs, { onConflict: "id", ignoreDuplicates: true });
    if (error) console.warn("⚠️  complexes stub upsert error:", error.message);
    else console.log(`✅  ${stubs.length}개 단지 stub 생성`);
  }

  // complex_transactions upsert (1000개씩 배치)
  let upserted = 0;
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await sb.from("complex_transactions").upsert(batch, {
      onConflict: "complex_id,yyyymm,area_m2",
    });
    if (error) {
      console.error(`❌  batch ${i}~${i + BATCH} error:`, error.message);
    } else {
      upserted += batch.length;
      process.stdout.write(`\r  저장 중... ${upserted}/${rows.length}`);
    }
  }
  console.log(`\n✅  ${upserted}개 레코드 upsert 완료`);
}

async function main() {
  console.log(`📂  CSV 파일: ${CSV_FILE}`);
  console.log(`🔑  dry-run: ${isDryRun}`);

  await processCSV();
  console.log(`📋  파싱 완료: 총 ${totalRows}행, 건너뜀 ${skippedRows}행`);

  await upsertToSupabase();
  console.log("🎉  완료");
}

main().catch((e) => { console.error(e); process.exit(1); });
