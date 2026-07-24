/**
 * supabase/SCHEMA.md 재생성 — 운영 DB 실측값으로 통째로 덮어씁니다.
 * 손으로 쓴 내용은 지워지니, 문서를 바꾸려면 이 스크립트를 바꾸세요.
 *
 * 사전 준비 (apply-migration.mjs 와 동일):
 *   Supabase Dashboard → Project Settings → Database → Connection string (URI, Session)
 *   `.env.local` 에 `SUPABASE_DB_DIRECT_URL=postgresql://...` 추가
 *
 * 사용:
 *   node ./scripts/generate-schema-doc.mjs
 *   npm run db:schema:doc
 */
import pg from "pg";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

// 컬럼 인벤토리 — 표기법은 SCHEMA.md '표기법' 절과 1:1로 맞춘다.
const INVENTORY_SQL = `
with t as (
  select c.relname as tbl, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
pk as (
  select distinct kcu.table_name, kcu.column_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY'
),
fkr as (
  select distinct on (kcu.table_name, kcu.column_name)
         kcu.table_name, kcu.column_name, ccu.table_name as ref
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
  where tc.table_schema = 'public' and tc.constraint_type = 'FOREIGN KEY'
  order by kcu.table_name, kcu.column_name, ccu.table_name
),
lines as (
  select c.table_name,
    string_agg('  ' || c.column_name || ' ' ||
      case c.data_type
        when 'timestamp with time zone' then 'timestamptz'
        when 'character varying' then 'varchar'
        when 'double precision' then 'float8'
        else c.data_type end
      || case when c.is_nullable = 'NO' then ' NOT NULL' else '' end
      || case when pk.column_name is not null then ' PK' else '' end
      || case when fkr.ref is not null then ' ->' || fkr.ref else '' end,
      chr(10) order by c.ordinal_position) as body,
    count(*) as ncols
  from information_schema.columns c
  left join pk on pk.table_name = c.table_name and pk.column_name = c.column_name
  left join fkr on fkr.table_name = c.table_name and fkr.column_name = c.column_name
  where c.table_schema = 'public'
  group by c.table_name
)
select t.tbl, t.rls, l.ncols, l.body
from t join lines l on l.table_name = t.tbl
order by t.tbl
`;

// F9 이력 — 왜 이 문서가 schema.sql 을 대체했는지. 사실 기록이라 재생성해도 유지한다.
const F9_HISTORY = `## 왜 이 파일이 생겼나 (F9)

이 자리에는 원래 \`supabase/schema.sql\` 이 있었습니다. 163줄에 테이블 10개를 선언했는데,
2026-07-24 운영 DB와 대조한 결과:

- 선언된 10개 중 **8개가 운영 DB에 존재하지 않았습니다** —
  \`ai_reports\`, \`alert_rules\`, \`comments\`, \`compare_lists\`, \`complexes\`, \`notes\`, \`notifications\`, \`trades\`
- 실재하는 2개(\`posts\`, \`profiles\`)도 컬럼 구성이 전혀 달랐습니다
  (선언된 \`profiles.nickname\`·\`age_band\` 등은 실제로 없고, 실제 \`profiles\` 는 24컬럼)
- 실제로 쓰이는 \`listings\`·\`inspection_notes\`·\`market_transactions\` 등 **123개 테이블이 통째로 누락**

즉 그 파일을 읽고 데이터 모델을 파악하려던 사람은 전부 틀린 그림을 얻었습니다.
사실이 아닌 문서는 없는 것만 못하므로 삭제하고, 실측 기반의 이 문서로 대체했습니다.

## 표기법

\`\`\`
### 테이블명 (컬럼수, RLS)
  컬럼명 타입 [NOT NULL] [PK] [->참조테이블]
\`\`\`

\`->X\` 는 그 컬럼에 걸린 단일 컬럼 외래키의 대상 테이블입니다.
복합키 외래키, CHECK 제약, 인덱스, 트리거, 정책 본문은 이 문서에 담지 않습니다
(운영 DB에서 직접 조회하세요 — 쿼리는 \`supabase/migrations/README.md\` 참고).`;

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

function nf(n) {
  return Number(n).toLocaleString("en-US");
}

async function one(sql) {
  const { rows } = await client.query(sql);
  return rows[0];
}

try {
  await client.connect();

  const stats = await one(`
    select
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r') as tables,
      (select count(*) from information_schema.columns where table_schema = 'public') as columns,
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v') as views,
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public') as functions,
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) as rls_tables,
      (select count(*) from pg_policies where schemaname = 'public') as policies
  `);

  const ext = await one(`
    select coalesce(string_agg('\`' || extname || '\`', ', ' order by extname), '없음') as list
    from pg_extension where extname <> 'plpgsql'
  `);

  const mig = await one(`
    select count(*)::int as n, min(version) as lo, max(version) as hi
    from supabase_migrations.schema_migrations
  `);

  const { rows: tables } = await client.query(INVENTORY_SQL);

  const today = new Date().toISOString().slice(0, 10);
  const projectRef =
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ??
    connectionString.match(/postgres\.([a-z0-9]+):/)?.[1] ??
    "(알 수 없음)";

  const head = `# 누구집 데이터베이스 스키마 (생성된 참조 문서)

> **이 파일은 손으로 쓰지 않습니다.** \`node scripts/generate-schema-doc.mjs\` 가 운영 DB에서 직접 뽑아
> 덮어씁니다. 사람이 편집하면 다음 생성 때 지워집니다.

- 대상 프로젝트: Supabase \`${projectRef}\`
- 생성 시각: **${today} (UTC)** — 이 시점의 운영 DB 실측값
- 규모: 테이블 **${nf(stats.tables)}**개 / 컬럼 **${nf(stats.columns)}**개 / 뷰 ${nf(stats.views)}개 / 함수 ${nf(stats.functions)}개
- RLS: **${nf(stats.rls_tables)}개 테이블 활성**, 정책 ${nf(stats.policies)}개
- 확장: ${ext.list}
- 적용된 마이그레이션: **${nf(mig.n)}개** (\`${mig.lo}\` ~ \`${mig.hi}\`)

## 이 문서의 지위 — 진실의 원천이 아니다

스키마의 진실의 원천은 **운영 DB에 적용된 ${nf(mig.n)}개 마이그레이션**(\`supabase_migrations.schema_migrations\`)
입니다. 이 문서는 그 결과를 읽기 쉽게 뽑아 놓은 **스냅샷**이고, 실행 가능한 DDL이 아닙니다.
DB를 재구성해야 한다면 \`supabase/migrations/README.md\` 의 복원 절차를 따르세요.

${F9_HISTORY}

---

`;

  const body = tables
    .map(
      (r) =>
        `### ${r.tbl} (${r.ncols} cols, ${r.rls ? "RLS" : "RLS 없음"})\n${r.body}`,
    )
    .join("\n\n");

  const out = join(root, "supabase", "SCHEMA.md");
  writeFileSync(out, head + body + "\n", "utf8");
  console.log(
    `supabase/SCHEMA.md 갱신 — 테이블 ${tables.length}개 / 컬럼 ${nf(stats.columns)}개 (${today})`,
  );
} catch (err) {
  console.error("스키마 문서 생성 실패:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
