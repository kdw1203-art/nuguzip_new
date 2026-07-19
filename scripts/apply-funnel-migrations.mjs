/**
 * Supabase **원격** Postgres에 034·035 마이그레이션 SQL을 직접 적용합니다.
 * (supabase db push / CLI 로그인 없이 사용 가능)
 *
 * 사전: Dashboard → Project Settings → Database → Connection string (URI) 에서
 * `postgresql://postgres.[ref]:[YOUR-PASSWORD]@...` 복사 후 `.env.local`에 넣으세요.
 *
 *   SUPABASE_DB_DIRECT_URL=postgresql://...
 *
 * Usage:  node ./scripts/apply-funnel-migrations.mjs
 */
import pg from "pg";
import { existsSync, readFileSync } from "node:fs";
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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
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
    "[apply-funnel-migrations] Set SUPABASE_DB_DIRECT_URL in .env.local (Database → Connection string, Session mode).",
  );
  process.exit(1);
}

const { Client } = pg;
const client = new Client({
  connectionString: connectionString.trim(),
  // Pooler/클라우드 Postgrees SSL
  ssl: connectionString.includes("supabase.com") || connectionString.includes("pooler")
    ? { rejectUnauthorized: false }
    : undefined,
});

const files = ["034_platform_activity_events.sql", "035_strategy_funnel_waid.sql"];
const migDir = join(root, "supabase", "migrations");

try {
  await client.connect();
  for (const name of files) {
    const path = join(migDir, name);
    const sql = readFileSync(path, "utf8");
    process.stdout.write(`Applying ${name} ... `);
    await client.query(sql);
    process.stdout.write("ok\n");
  }
  await client.end();
  console.log("[apply-funnel-migrations] Done.");
} catch (e) {
  try {
    await client.end();
  } catch {
    // ignore
  }
  console.error("[apply-funnel-migrations] Error:", e instanceof Error ? e.message : e);
  process.exit(1);
}
