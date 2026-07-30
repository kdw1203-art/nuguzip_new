/**
 * RLS 형태 정적+선택적 원격 점검.
 * 1) 마이그레이션에 ENABLE ROW LEVEL SECURITY 존재 여부
 * 2) SUPABASE_DB_DIRECT_URL 있으면 pg_class.relrowsecurity 카운트
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const migDir = join(root, "supabase", "migrations");

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

const failures = [];
let enableCount = 0;
let policyCount = 0;

if (!existsSync(migDir)) {
  failures.push("supabase/migrations missing");
} else {
  for (const name of readdirSync(migDir)) {
    if (!name.endsWith(".sql")) continue;
    const text = readFileSync(join(migDir, name), "utf8");
    const enables = text.match(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi) || [];
    const policies = text.match(/CREATE\s+POLICY/gi) || [];
    enableCount += enables.length;
    policyCount += policies.length;
  }
  console.log(`[rls-shape] migrations: ENABLE RLS ×${enableCount}, CREATE POLICY ×${policyCount}`);
  if (enableCount < 5) {
    failures.push(`expected ENABLE RLS in migrations, got ${enableCount}`);
  }
  if (policyCount < 3) {
    failures.push(`expected CREATE POLICY in migrations, got ${policyCount}`);
  }
}

const dbUrl =
  process.env.SUPABASE_DB_DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();

if (dbUrl) {
  try {
    const pg = await import("pg");
    const client = new pg.default.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    const res = await client.query(`
      select
        count(*) filter (where c.relrowsecurity) as rls_on,
        count(*) as public_tables
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `);
    await client.end();
    const row = res.rows[0];
    const rlsOn = Number(row?.rls_on ?? 0);
    const tables = Number(row?.public_tables ?? 0);
    console.log(`[rls-shape] live: rls_on=${rlsOn}/${tables}`);
    if (tables > 0 && rlsOn / tables < 0.7) {
      failures.push(`live RLS coverage low: ${rlsOn}/${tables}`);
    }
  } catch (e) {
    console.warn(
      `[rls-shape] live DB skip: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
} else {
  console.log("[rls-shape] live DB skipped (no SUPABASE_DB_DIRECT_URL)");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("rls-shape check OK");
