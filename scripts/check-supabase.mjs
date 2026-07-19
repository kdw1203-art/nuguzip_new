/**
 * Supabase 연결 상태 점검 — Service Role · DB 직접 URL · inspection_sessions 테이블
 *
 * 사용: node ./scripts/check-supabase.mjs
 *       npm run db:check
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile(join(root, ".env.local"));
loadEnvFile(join(root, ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const dbUrl = process.env.SUPABASE_DB_DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();

console.info("[check-supabase] --- 환경변수 ---");
console.info(`  NEXT_PUBLIC_SUPABASE_URL: ${url ? "✓" : "✗ missing"}`);
console.info(`  SUPABASE_SERVICE_ROLE_KEY: ${serviceKey ? "✓" : "✗ missing (세션·노트 DB 저장 불가)"}`);
console.info(`  SUPABASE_DB_DIRECT_URL: ${dbUrl ? "✓" : "✗ missing (마이그레이션 npm run db:apply 불가)"}`);

if (!url || !serviceKey) {
  console.info("\n[check-supabase] Dashboard → Settings → API 에서 service_role 키를 .env.local 에 추가하세요.");
  process.exit(serviceKey ? 0 : 1);
}

try {
  const res = await fetch(`${url}/rest/v1/inspection_sessions?select=id&limit=1`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (res.status === 404 || res.status === 400) {
    const text = await res.text();
    if (/inspection_sessions|relation|schema cache/i.test(text)) {
      console.warn("\n[check-supabase] ✗ inspection_sessions 테이블 없음 — 마이그레이션 049 필요");
      console.info("  npm run db:apply -- 049_inspection_sessions_pipeline.sql");
    } else {
      console.warn(`\n[check-supabase] REST 오류 (${res.status}): ${text.slice(0, 200)}`);
    }
  } else if (res.ok) {
    console.info("\n[check-supabase] ✓ inspection_sessions REST 접근 OK");
  } else {
    console.warn(`\n[check-supabase] REST ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
} catch (e) {
  console.warn("\n[check-supabase] REST ping 실패:", e instanceof Error ? e.message : e);
}

if (dbUrl) {
  const { Client } = pg;
  const client = new Client({
    connectionString: dbUrl,
    ssl: /supabase\.(co|com)|pooler/.test(dbUrl) ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await client.connect();
    const r = await client.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'inspection_sessions'
      ) AS ok`,
    );
    console.info(`[check-supabase] ✓ Postgres inspection_sessions: ${r.rows[0]?.ok ? "exists" : "missing"}`);
    await client.end();
  } catch (e) {
    console.warn("[check-supabase] Postgres 연결 실패:", e instanceof Error ? e.message : e);
  }
}

console.info("\n[check-supabase] 완료");
