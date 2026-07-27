#!/usr/bin/env node
/**
 * 마이그레이션 정적 린트 — 두 가지를 본다.
 *   (A) "drop 하고 grant 를 잊지 않았는가"
 *   (B) "revoke ... on function 에서 public 을 빠뜨리지 않았는가"
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
 * ── 규칙 B ─────────────────────────────────────────────────────────────
 * `revoke ... on function ... from <역할목록>` 의 역할 목록에 `public` 이 없으면
 * 실패시킨다.
 *
 * 왜: PostgreSQL 은 함수를 만들 때 기본으로 `GRANT EXECUTE ... TO PUBLIC` 을 준다.
 * `anon`·`authenticated` 는 그 권한을 **개별로 받은 적이 없고 PUBLIC 의 구성원으로서**
 * 갖는다. 그래서 `from anon, authenticated` 만 적은 revoke 는 없는 권한을 회수하는
 * 문장이라 아무 일도 하지 않고 **조용히 성공한다** — 에러도 경고도 없다.
 * 2026-07-19 감사 리포트가 "EXECUTE 회수 완료"라고 적어 둔 함수 3개가 실제로는
 * 그대로 열려 있었던 이유가 정확히 이것이다(docs/security-audit.md 정정 2).
 * 문법상 성공하지만 의미상 실패하는 문장이라 사람 눈으로는 걸러지지 않는다.
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

/**
 * `revoke ... on function <이름>(<인자>) from <역할목록>;` 를 함수 단위로 모은다.
 * 반환: Map<정규화된 함수명, Set<소문자 역할명>>
 *
 * 역할을 **파일 안의 모든 revoke 문에 걸쳐 합집합으로** 본다. 한 함수에 대해
 *   revoke ... from public;
 *   revoke ... from anon;
 * 처럼 줄을 나눠 쓰는 스타일(예: 20260725170000_point_ledger_spend_rpc.sql)이
 * 이미 있고, 그건 올바른 코드이기 때문이다. 문제는 어느 줄에도 public 이
 * 없는 경우뿐이다.
 */
function collectFunctionRevokes(sql) {
  const out = new Map();
  const re = /\brevoke\s+[\s\S]*?\bon\s+function\s+([\w".]+)\s*(?:\([^)]*\))?\s*from\s+([^;]+);/gi;
  for (const m of sql.matchAll(re)) {
    const fn = normalize(m[1]);
    const roles = m[2]
      .split(",")
      .map((r) => r.replace(/"/g, "").trim().toLowerCase())
      .filter(Boolean);
    const set = out.get(fn) ?? new Set();
    for (const r of roles) set.add(r);
    out.set(fn, set);
  }
  return out;
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
    functionRevokes: collectFunctionRevokes(sql),
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

/* ── 규칙 B: revoke ... on function 에 public 이 들어 있는가 ────────────── */
const revokeFailures = [];
let revokeChecked = 0;

for (let i = 0; i < parsed.length; i += 1) {
  const cur = parsed[i];
  for (const [fn, roles] of cur.functionRevokes) {
    revokeChecked += 1;
    /* 규칙 A 와 같은 태도 — 최종 상태에 public 회수가 있으면 됐다.
       나중 마이그레이션이 바로잡았다면 그 파일은 통과시킨다(이미 적용된
       마이그레이션은 고쳐 쓰는 게 아니라 뒤에 한 장 더 붙여 고친다).
       새로 추가하는 파일은 늘 마지막이므로 빠뜨리면 그 자리에서 걸린다. */
    const fixedLater = parsed
      .slice(i)
      .some((later) => later.functionRevokes.get(fn)?.has("public"));
    if (!fixedLater) {
      revokeFailures.push({ file: cur.file, fn, roles: [...roles].join(", ") });
    }
  }
}

if (revokeFailures.length > 0) {
  console.error(
    `${TAG} FAIL — revoke ... on function 의 대상에 public 이 빠진 함수 ${revokeFailures.length}건`,
  );
  for (const f of revokeFailures) {
    console.error(`  ✗ ${f.file}\n      ${f.fn} — revoke 대상: ${f.roles} (public 없음)`);
  }
  console.error(
    `\n  PostgreSQL 은 함수 생성 시 기본으로 GRANT EXECUTE ... TO PUBLIC 을 줍니다.` +
      `\n  anon·authenticated 는 그 권한을 개별로 받은 게 아니라 **PUBLIC 의 구성원으로서**` +
      `\n  갖고 있습니다. 그래서 'from anon, authenticated' 만 적은 revoke 는 없는 권한을` +
      `\n  회수하는 문장이라 아무 일도 하지 않고 조용히 성공합니다 — 함수는 그대로 열려 있습니다.` +
      `\n  다음처럼 public 을 반드시 포함하세요:` +
      `\n      revoke all on function public.<함수>(<인자>) from public, anon, authenticated;` +
      `\n      grant execute on function public.<함수>(<인자>) to service_role;` +
      `\n  선례: supabase/migrations/20260725170000_point_ledger_spend_rpc.sql` +
      `\n  배경: docs/security-audit.md 2026-07-27 정정 2`,
  );
  process.exit(1);
}

const total = parsed.reduce(
  (s, p) => s + new Set(p.dropped.filter((n) => p.created.includes(n))).size,
  0,
);
console.info(
  `${TAG} PASS — 마이그레이션 ${files.length}개 · 재생성 객체 ${total}건 GRANT 확인 · ` +
    `함수 revoke ${revokeChecked}건 public 포함 확인`,
);
