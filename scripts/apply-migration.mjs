/**
 * Supabase **원격** Postgres에 임의의 마이그레이션 SQL을 직접 적용합니다.
 * (supabase CLI / 로그인 없이 사용 가능)
 *
 * 사전 준비:
 *   Supabase Dashboard → Project Settings → Database → Connection string (URI, Session)
 *   `postgresql://postgres.[ref]:[YOUR-PASSWORD]@...pooler.supabase.com:5432/postgres`
 *   복사 후 `.env.local`에 추가:
 *
 *     SUPABASE_DB_DIRECT_URL=postgresql://...
 *
 * 사용:
 *   node ./scripts/apply-migration.mjs 044_market_data.sql
 *   node ./scripts/apply-migration.mjs 044_market_data.sql 045_something.sql
 *   (인자 없으면 supabase/migrations 의 모든 파일을 이름순으로 적용)
 */
import pg from "pg";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const connectionString = process.env.SUPABASE_DB_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  console.error(
    "[apply-migration] .env.local 에 SUPABASE_DB_DIRECT_URL 을 설정하세요 (Database → Connection string, Session mode).",
  );
  process.exit(1);
}

const migDir = join(root, "supabase", "migrations");
const argv = process.argv.slice(2);
const files = argv.length > 0 ? argv : readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();

const { Client } = pg;
const client = new Client({
  connectionString: connectionString.trim(),
  ssl:
    /supabase\.(co|com)|pooler/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
});

try {
  await client.connect();
  for (const name of files) {
    const path = join(migDir, name);
    if (!existsSync(path)) {
      console.warn(`[apply-migration] skip (없음): ${name}`);
      continue;
    }
    const sql = readFileSync(path, "utf8");
    process.stdout.write(`Applying ${name} ... `);
    try {
      await client.query(sql);
      process.stdout.write("ok\n");
    } catch (e) {
      // 정책 중복 등 재실행 시 발생하는 오류는 경고로만 처리
      const msg = e instanceof Error ? e.message : String(e);
      if (/already exists|duplicate/i.test(msg)) {
        process.stdout.write(`skipped (${msg})\n`);
      } else {
        throw e;
      }
    }
  }
  await client.end();
  console.log("[apply-migration] Done.");
} catch (e) {
  try {
    await client.end();
  } catch {
    // ignore
  }
  console.error("[apply-migration] Error:", e instanceof Error ? e.message : e);
  process.exit(1);
}
