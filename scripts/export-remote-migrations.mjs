/**
 * 운영 DB에 적용된 마이그레이션 전체를 supabase/migrations/ 로 내려받습니다.
 *
 * 이 저장소는 오랫동안 마이그레이션을 원격에만 적용해 왔고(supabase_migrations.schema_migrations),
 * 로컬 supabase/migrations 디렉터리가 없었습니다. 이 스크립트는 그 간극을 메웁니다 —
 * 원격이 정본이고, 로컬 파일은 그 정본을 파일로 펼친 사본입니다.
 *
 * 사전 준비 (apply-migration.mjs 와 동일):
 *   `.env.local` 에 `SUPABASE_DB_DIRECT_URL=postgresql://...`
 *
 * 사용:
 *   node ./scripts/export-remote-migrations.mjs            # 없는 파일만 생성
 *   node ./scripts/export-remote-migrations.mjs --force    # 기존 파일도 덮어씀
 *   npm run db:migrations:export
 */
import pg from "pg";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    "SUPABASE_DB_DIRECT_URL(또는 DATABASE_URL)이 없습니다. .env.local 에 추가한 뒤 다시 실행하세요.",
  );
  process.exit(1);
}

const force = process.argv.slice(2).includes("--force");
const outDir = join(root, "supabase", "migrations");
mkdirSync(outDir, { recursive: true });

function slug(name) {
  return String(name ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const { rows } = await client.query(
    `select version, name, statements
       from supabase_migrations.schema_migrations
      order by version`,
  );

  let written = 0;
  let skipped = 0;
  let empty = 0;

  for (const row of rows) {
    const statements = Array.isArray(row.statements) ? row.statements : [];
    if (statements.length === 0) {
      // statements 가 비어 있으면 파일로 복원할 내용이 없다 — 조용히 넘기지 않고 알린다.
      empty += 1;
      console.warn(`  (건너뜀) ${row.version} — statements 가 비어 있어 복원할 SQL이 없습니다`);
      continue;
    }
    const base = slug(row.name);
    const file = join(outDir, base ? `${row.version}_${base}.sql` : `${row.version}.sql`);
    if (existsSync(file) && !force) {
      skipped += 1;
      continue;
    }
    const sql = statements
      .map((s) => String(s).trim().replace(/;+$/, ""))
      .filter(Boolean)
      .join(";\n\n");
    writeFileSync(file, `${sql};\n`, "utf8");
    written += 1;
  }

  console.log(
    `마이그레이션 내보내기 완료 — 전체 ${rows.length}건 / 생성 ${written} / 기존 유지 ${skipped}` +
      (empty ? ` / SQL 없음 ${empty}` : ""),
  );
  if (skipped && !force) {
    console.log("기존 파일까지 덮어쓰려면 --force 를 붙이세요.");
  }
} catch (err) {
  console.error("마이그레이션 내보내기 실패:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
