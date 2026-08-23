/**
 * [#149] 핵심 표 논리 백업 — 무료 플랜(일일 백업 7일 보관)의 보험.
 *
 * Supabase 자동 백업과 별개로, 사용자 생성 자산(복구 불가 데이터)을
 * JSON 으로 내려받아 저장소 밖(backups/)에 보관한다. 시세·뉴스처럼
 * 재수집 가능한 대용량 표는 대상이 아니다 — 재수집 불가 자산만.
 *
 * 사용: node ./scripts/backup-critical-tables.mjs
 * 필요 env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local 도 읽음)
 * 출력: backups/YYYY-MM-DD/<table>.json + manifest.json (행수 대조용)
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFile(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnvFile(join(root, ".env.local"));
loadEnvFile(join(root, ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[backup] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

/* 재수집 불가(사용자 생성·운영 원장) 표만 — 시세/뉴스 원문/집계 MV 는 제외 */
const TABLES = [
  "profiles",
  "inspection_notes",
  "board_posts",
  "board_comments",
  "point_ledger",
  "billing_subscriptions",
  "payments",
  "note_templates",
  "saved_searches",
  "user_watchlist",
  "expert_profiles",
  "content_reports",
];

const day = new Date().toISOString().slice(0, 10);
const outDir = join(root, "backups", day);
mkdirSync(outDir, { recursive: true });

const PAGE = 1000;
async function dumpTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { table, ok: false, error: error.message, rows: rows.length };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    if (rows.length > 200_000) return { table, ok: false, error: "행수 상한 초과 — 대상 재검토", rows: rows.length };
  }
  writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows));
  return { table, ok: true, rows: rows.length };
}

const manifest = { day, url: url.replace(/^https?:\/\//, ""), tables: [] };
let failed = 0;
for (const t of TABLES) {
  const r = await dumpTable(t);
  manifest.tables.push(r);
  console.log(`[backup] ${t}: ${r.ok ? `${r.rows}행` : `실패 — ${r.error}`}`);
  if (!r.ok) failed++;
}
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`[backup] ${failed === 0 ? "완료" : `완료(실패 ${failed}표)`} → backups/${day}/ (저장소에 커밋하지 말 것 — .gitignore 확인)`);
process.exit(failed === 0 ? 0 : 1);
