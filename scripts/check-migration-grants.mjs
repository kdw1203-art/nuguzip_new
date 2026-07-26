#!/usr/bin/env node
/**
 * 마이그레이션 정적 린트 — "drop 하고 grant 를 잊지 않았는가".
 *
 * ── 왜 있나 ────────────────────────────────────────────────────────────
 * DROP VIEW / DROP MATERIALIZED VIEW 는 그 객체에 걸린 GRANT 를 함께 지운다.
 * 뷰는 CREATE OR REPLACE 로 권한을 지키며 바꿀 수 있지만, **머티리얼라이즈드
 * 뷰에는 CREATE OR REPLACE 가 없다** — 정의를 바꾸려면 drop + create 뿐이고,
 * 그때 GRANT 를 다시 적지 않으면 조용히 권한이 사라진다.
 * 2026-07-25 에 정확히 이 일이 있었고(20260725042708), 래퍼 뷰가
 * security_invoker = on 이라 래퍼에 준 권한으로는 아무것도 가려지지 않아
 * /tx 와 /sitemap-tx.xml 이 하루 동안 42501 로 죽었다.
 *
 * 이 린트는 그 실수를 사람이 아니라 CI 가 잡게 한다.
 *
 * ── 규칙 ───────────────────────────────────────────────────────────────
 * 한 마이그레이션이 어떤 객체를 drop 하고 (같은 파일에서) 다시 create 하면,
 * 그 파일 또는 **그보다 나중** 마이그레이션 어딘가에 그 객체를 향한
 * GRANT 가 있어야 한다. "나중 파일도 인정" 은 느슨해 보이지만 실제 불변식과
 * 정확히 같다 — 최종 상태에 권한이 있으면 된다. 새로 추가하는 마이그레이션은
 * 항상 마지막이므로, 빠뜨리면 그 자리에서 걸린다.
 * (`grant ... on all tables in schema X to ...` 는 그 스키마 전체를 덮는 것으로 본다.)
 *
 * 사용: node ./scripts/check-migration-grants.mjs · npm run check:migration-grants
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");
const TAG = "[check-migration-grants]";

/** SQL 주석 제거 — 헤더 설명문에 나오는 "grant" 같은 낱말에 속지 않기 위해. */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** schema.name 을 소문자·따옴표 제거·스키마 보정한 정규형으로. */
function normalize(ident) {
  const clean = ident.replace(/"/g, "").trim().toLowerCase().replace(/;$/, "");
  return clean.includes(".") ? clean : `public.${clean}`;
}

function matchAll(sql, re) {
  return [...sql.matchAll(re)].map((m) => normalize(m[1]));
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`${TAG} FAIL — supabase/migrations 에 .sql 파일이 없습니다.`);
  process.exit(1);
}

const parsed = files.map((file) => {
  const sql = stripComments(readFileSync(join(dir, file), "utf8"));
  return {
    file,
    dropped: [
      ...matchAll(sql, /\bdrop\s+materialized\s+view\s+(?:if\s+exists\s+)?([\w".]+)/gi),
      ...matchAll(sql, /\bdrop\s+view\s+(?:if\s+exists\s+)?([\w".]+)/gi),
    ],
    created: [
      ...matchAll(sql, /\bcreate\s+materialized\s+view\s+(?:if\s+not\s+exists\s+)?([\w".]+)/gi),
      ...matchAll(sql, /\bcreate\s+(?:or\s+replace\s+)?view\s+([\w".]+)/gi),
    ],
    granted: matchAll(sql, /\bgrant\s+[^;]*?\bon\s+(?:table\s+)?([\w".]+)\s+to\b/gi),
    grantedSchemas: [
      ...sql.matchAll(/\bgrant\s+[^;]*?\bon\s+all\s+tables\s+in\s+schema\s+([\w",\s]+?)\s+to\b/gi),
    ].flatMap((m) => m[1].split(",").map((s) => s.replace(/"/g, "").trim().toLowerCase())),
  };
});

const failures = [];

for (let i = 0; i < parsed.length; i += 1) {
  const cur = parsed[i];
  const recreated = cur.dropped.filter((name) => cur.created.includes(name));
  for (const name of new Set(recreated)) {
    const schema = name.split(".")[0];
    const covered = parsed
      .slice(i)
      .some((later) => later.granted.includes(name) || later.grantedSchemas.includes(schema));
    if (!covered) {
      failures.push({ file: cur.file, name });
    }
  }
}

if (failures.length > 0) {
  console.error(`${TAG} FAIL — drop + create 후 GRANT 가 없는 객체 ${failures.length}건`);
  for (const f of failures) {
    console.error(`  ✗ ${f.file}\n      ${f.name} 을(를) drop 후 다시 만들었지만 GRANT 가 어디에도 없습니다.`);
  }
  console.error(
    `\n  DROP 은 GRANT 를 같이 지웁니다. 같은 파일 끝에 다음 줄을 넣으세요:` +
      `\n      grant select on <schema>.<객체> to anon, authenticated, service_role;` +
      `\n  래퍼 뷰가 security_invoker = on 이면 래퍼가 아니라 **밑단 객체**에 줘야 합니다.` +
      `\n  선례: supabase/migrations/20260726061500_restore_market_agg_mv_grants.sql`,
  );
  process.exit(1);
}

const total = parsed.reduce(
  (s, p) => s + new Set(p.dropped.filter((n) => p.created.includes(n))).size,
  0,
);
console.info(`${TAG} PASS — 마이그레이션 ${files.length}개 · 재생성 객체 ${total}건 모두 GRANT 확인`);
