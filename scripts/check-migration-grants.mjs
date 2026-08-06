#!/usr/bin/env node
/**
 * 마이그레이션 정적 린트 — 세 가지를 본다.
 *   (A) "drop 하고 grant 를 잊지 않았는가"
 *   (B) "revoke ... on function 에서 public 을 빠뜨리지 않았는가"
 *   (C) "anon 에게 쓰기 권한을 주고 있지 않은가"
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
 * ── 규칙 C ─────────────────────────────────────────────────────────────
 * `grant <쓰기동사> on <표|시퀀스> to anon` 을 실패시킨다. authenticated 에게는
 * TRUNCATE/REFERENCES/TRIGGER/MAINTAIN 만 막는다 — I/U/D 는 정책 17개가 실제로
 * auth.email() 기준으로 쓰고 있어서 막으면 기능이 죽는다.
 *   → 겹침을 없애되 존재를 지우지 않는다.
 *
 * 왜: anon 은 브라우저 번들에 그대로 실려 나가는 publishable 키의 역할이다.
 * 2026-08-06 실측에서 anon 이 public 176개 관계 중 76개에 INSERT/UPDATE/DELETE/
 * TRUNCATE/REFERENCES/TRIGGER 를, 81개에 MAINTAIN 을, 시퀀스 15개 전부에
 * USAGE/UPDATE 를 갖고 있었다. "RLS 가 막아 준다"는 anon 에 걸리는 쓰기 정책
 * 29개를 전부 분류해 보니 I/U/D 에 대해서만 참이었고, **TRUNCATE 는 RLS 의
 * 대상이 아니다** — 일회용 표로 재 보니 anon 이 5행을 통째로 지웠다. 지금까지
 * 안 터진 유일한 이유는 PostgREST 에 TRUNCATE 동사가 없다는 것뿐이었다.
 *   → 방어적으로 보이는 조건이 절대 안 걸리면, 그건 방어가 아니라 거짓 안전망이다.
 * 20260806171024 가 전부 회수했다. 이 규칙은 그게 다시 열리는 걸 막는다.
 *
 * ── 이 규칙은 그 사고를 잡았을까? **아니다** ────────────────────────────
 * 그 76개는 파일에 적힌 grant 가 아니었다. 저장소 82개 파일에 `grant <쓰기동사>
 * … to anon` 은 **0건**이고, 원장 258행에도 2건(둘 다 INSERT)뿐이다. 진짜 원인은
 * Supabase 프로젝트의 **기본권한** — 2026-08-02 의 sec_lock_default_privileges_public
 * 이 끄기 전까지 public 에 새로 만드는 모든 표가 anon 에게 전권을 갖고 태어났다.
 * 기본권한은 미래 객체에만 적용되므로 그날 이전 표들은 그대로 남았다.
 * 즉 이 규칙은 **앞으로 누가 파일로 다시 여는 것**만 막는다. 이미 열려 있던 것을
 * 잡은 건 이 규칙이 아니라 DB 를 직접 센 실측이었다.
 *   → 가려진 한계는 없는 한계처럼 읽힌다. 그래서 여기에 적는다.
 *
 * 최종 상태 의미론은 A·B 와 같다 — 과거 파일의 grant 는 그 이후(자기 자신 포함)
 * 파일의 revoke 로 덮이면 통과한다. 옛 마이그레이션을 고쳐 쓰지 않아도 되고,
 * 새로 추가하는 파일은 늘 마지막이므로 빠뜨리면 그 자리에서 걸린다.
 * `on all tables in schema X` 회수는 그 스키마의 개별 표 grant 를 덮는 것으로 본다.
 * `alter default privileges` 는 별도로(같은 최종 상태 규칙으로) 본다 —
 * 시퀀스 기본권한이 `anon=rwU` 였던 게 실제 구멍이었기 때문이다.
 *
 * ── 이 린트가 안 보는 것 ───────────────────────────────────────────────
 * supabase/migrations 의 **파일만** 읽는다. MCP apply_migration 으로 적용하고
 * 파일을 안 남긴 마이그레이션은 여기서 아예 보이지 않는다 — 볼 파일이 없으니
 * 조용히 통과한다. 2026-08-06 전수 대조에서 그렇게 적용된 객체가 78개였다.
 * 그쪽은 check-migration-ledger.mjs 가 센다. 그래서 아래 PASS 줄에도
 * "파일 N개를 봤다" 가 아니라 "파일 N개만 봤다" 로 적는다 — 본 범위를 밝히지 않은
 * 통과는 안 본 곳까지 괜찮다는 말로 읽힌다.
 * 규칙 C 는 추가로 **기본권한(ALTER DEFAULT PRIVILEGES)이 낸 구멍**을 못 본다.
 * 파일 안의 ADP 문장은 보지만, 프로젝트 부트스트랩이 심어 둔 기본값은 파일에
 * 없다. 2026-08-06 의 76개 관계가 정확히 그렇게 열렸다(위 참조).
 * defaclrole=supabase_admin 의 public 표 기본값은 지금도 anon 에게 arwdDxtm 를
 * 주고 있고 postgres 로는 고칠 수 없다(42501) — 지금은 public 176개 관계가 전부
 * postgres 소유라 한 번도 적용된 적이 없지만, 이 린트가 막아 주는 게 아니다.
 * 기본권한 쪽은 파일이 아니라 DB 를 직접 세야 보인다.
 *
 * ── 이 검사기가 실제로 잡는지 확인하는 법 ────────────────────────────────
 *   node scripts/check-migration-grants.mjs --selftest
 * 규칙 C 만 순수 함수로 떼어 내 대 본다. 규칙 A·B 를 타고 통과하면 아무것도
 * 증명하지 못하기 때문이다 — 검사기가 이미 통과하고 있던 다른 것에 묻어
 * 통과할 수 있다.
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

/* ── 규칙 C 정의 ─────────────────────────────────────────────────────────
   순수 함수로 떼어 둔다. 파일 시스템을 안 타야 자가진단이 규칙 C 만 대 볼 수
   있다. 정규식은 전부 `[^;]` 로 한 문장 안에 가둔다 — 중첩 수량자를 쓴 정규식은
   대조에서는 통과하고 진짜 저장소에서 멎는다. */

/** `all` / `all privileges` 를 풀어 쓸 실제 동사. PG 17.6 기준(MAINTAIN 포함). */
const TABLE_ALL_VERBS = [
  "select",
  "insert",
  "update",
  "delete",
  "truncate",
  "references",
  "trigger",
  "maintain",
];
const SEQUENCE_ALL_VERBS = ["usage", "select", "update"];

/** 역할별·객체종류별 **금지** 동사. 여기 없는 동사는 허용이다. */
const FORBIDDEN_VERBS = {
  anon: {
    table: new Set(["insert", "update", "delete", "truncate", "references", "trigger", "maintain"]),
    sequence: new Set(["usage", "update"]),
  },
  authenticated: {
    // I/U/D 는 남긴다(정책이 실제로 쓴다). RLS 가 애초에 못 막는 것만 막는다.
    table: new Set(["truncate", "references", "trigger", "maintain"]),
    sequence: new Set(),
  },
};

/** 한 문장 안에 가둔 grant/revoke. 세미콜론이 없는 마지막 문장도 잡는다. */
const GRANT_RE = /\bgrant\s+([^;]*?)\s+on\s+([^;]*?)\s+to\s+([^;]+?)\s*(?:;|$)/gi;
const REVOKE_RE =
  /\brevoke\s+(?:grant\s+option\s+for\s+)?([^;]*?)\s+on\s+([^;]*?)\s+from\s+([^;]+?)\s*(?:;|$)/gi;
const ADP_RE = /\balter\s+default\s+privileges\b[^;]*;?/gi;

/**
 * 권한 목록을 쪼갠다. **컬럼 목록을 먼저 지운다** —
 * `grant select (id, title) on ... to anon` 의 괄호 안 쉼표에 속으면
 * 412e9e5 가 만든 컬럼 단위 부여가 전부 오탐이 된다.
 */
function splitPrivileges(text) {
  return text
    .replace(/\([^)]*\)/g, " ")
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim().toLowerCase())
    .map((p) => (p === "all privileges" ? "all" : p))
    .filter(Boolean);
}

/** 역할 목록을 쪼갠다. with grant option / group / cascade 같은 꼬리는 버린다. */
function splitRoles(text) {
  return text
    .replace(/\bwith\s+grant\s+option\b/gi, " ")
    .replace(/\bgranted\s+by\s+[\w".]+/gi, " ")
    .replace(/\b(cascade|restrict)\b/gi, " ")
    .split(",")
    .map((r) =>
      r
        .replace(/\bgroup\s+/gi, " ")
        .replace(/"/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

/** `all` 을 실제 동사로 펼친다. `grant all` 과 동사를 나열한 revoke 를 맞대기 위해. */
function expandVerbs(privileges, kind) {
  const out = new Set();
  const all = kind === "sequence" ? SEQUENCE_ALL_VERBS : TABLE_ALL_VERBS;
  for (const p of privileges) {
    if (p === "all") for (const v of all) out.add(v);
    else out.add(p);
  }
  return out;
}

/**
 * `on <대상>` 을 { kind, key } 목록으로. 한 문장이 여러 객체를 가리킬 수 있다.
 * key 는 `schema:<스키마>` 또는 `obj:<스키마>.<이름>`.
 */
function classifyTargets(text) {
  const t = text.replace(/\s+/g, " ").trim().toLowerCase();

  const allIn = /^all\s+(tables|sequences|functions|procedures|routines)\s+in\s+schema\s+(.+)$/.exec(t);
  if (allIn) {
    const kind = allIn[1] === "tables" ? "table" : allIn[1] === "sequences" ? "sequence" : "function";
    return allIn[2]
      .split(",")
      .map((s) => s.replace(/"/g, "").trim())
      .filter(Boolean)
      .map((s) => ({ kind, key: `schema:${s}` }));
  }
  if (/^(function|procedure|routine)\b/.test(t)) return [{ kind: "function", key: "fn" }];
  if (
    /^(schema|database|tablespace|language|type|domain|large\s+object|parameter|foreign\s+(data\s+wrapper|server))\b/.test(
      t,
    )
  ) {
    return [{ kind: "other", key: "other" }];
  }
  const isSeq = /^sequence\b/.test(t);
  const names = t.replace(/^(sequence|table)\s+/, "");
  return names
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => ({ kind: isSeq ? "sequence" : "table", key: `obj:${normalize(n)}` }));
}

function collectPrivilegeStatements(sql, re) {
  const out = [];
  for (const m of sql.matchAll(re)) {
    const privileges = splitPrivileges(m[1]);
    const roles = new Set(splitRoles(m[3]));
    for (const target of classifyTargets(m[2])) {
      /* pos 를 같이 들고 다닌다. 같은 파일 안에서는 **grant 뒤에 오는 revoke** 만
         덮은 것으로 봐야 한다. 안 그러면 `revoke …; grant …;` 순으로 적힌 한 장이
         자기 자신에게 덮여 통과한다. */
      out.push({
        kind: target.kind,
        key: target.key,
        verbs: expandVerbs(privileges, target.kind),
        roles,
        pos: m.index ?? 0,
      });
    }
  }
  return out;
}

/** `alter default privileges [for role R] [in schema S] grant|revoke ... on tables|sequences to|from ...` */
function parseDefaultPrivilege(stmt) {
  const m =
    /\b(grant|revoke)\s+(?:grant\s+option\s+for\s+)?([^;]*?)\s+on\s+(tables|sequences|functions|routines|types|schemas)\s+(?:to|from)\s+([^;]+?)\s*(?:;|$)/i.exec(
      stmt,
    );
  if (!m) return null;
  const objtype = m[3].toLowerCase();
  const kind = objtype === "tables" ? "table" : objtype === "sequences" ? "sequence" : "other";
  const schemaM = /\bin\s+schema\s+([\w",\s]+?)\s+(?:grant|revoke)\b/i.exec(stmt);
  const schemas = schemaM
    ? schemaM[1]
        .split(",")
        .map((s) => s.replace(/"/g, "").trim().toLowerCase())
        .filter(Boolean)
    : ["*"]; // 스키마를 안 적으면 현재 검색 경로 전체 — 가장 넓게 본다.
  return {
    action: m[1].toLowerCase(),
    kind,
    verbs: expandVerbs(splitPrivileges(m[2]), kind),
    roles: new Set(splitRoles(m[4])),
    schemas,
  };
}

/** 스키마 단위 회수는 그 스키마의 개별 객체 부여를 덮는다. 반대는 성립하지 않는다. */
function keyCovers(revokeKey, grantKey) {
  if (revokeKey === grantKey) return true;
  if (!revokeKey.startsWith("schema:") || !grantKey.startsWith("obj:")) return false;
  return grantKey.slice(4).split(".")[0] === revokeKey.slice(7);
}

/**
 * 규칙 C 본체 — 순수 함수.
 * @param {{file: string, sql: string}[]} rawFiles 파일명 오름차순(=적용 순서)
 * @returns {{file: string, role: string, verb: string, kind: string, target: string}[]}
 */
export function findAnonWriteGrantViolations(rawFiles) {
  const per = rawFiles.map(({ file, sql }) => {
    const clean = stripComments(sql);
    const adpStatements = [...clean.matchAll(ADP_RE)].map((x) => ({ text: x[0], pos: x.index ?? 0 }));
    // ADP 안의 grant/revoke 는 일반 문장 파서가 보면 안 된다(대상이 "tables" 라는 낱말이다).
    // 지우면 뒤 문장의 pos 가 밀리지만, ADP 끼리·일반 문장끼리만 비교하므로 문제없다.
    const rest = clean.replace(ADP_RE, " ");
    return {
      file,
      grants: collectPrivilegeStatements(rest, GRANT_RE),
      revokes: collectPrivilegeStatements(rest, REVOKE_RE),
      adp: adpStatements
        .map((s) => {
          const p = parseDefaultPrivilege(s.text);
          return p ? { ...p, pos: s.pos } : null;
        })
        .filter(Boolean),
    };
  });

  const violations = [];
  const roles = Object.keys(FORBIDDEN_VERBS);

  for (let i = 0; i < per.length; i += 1) {
    const later = per.slice(i);

    for (const g of per[i].grants) {
      for (const role of roles) {
        if (!g.roles.has(role)) continue;
        const banned = FORBIDDEN_VERBS[role][g.kind];
        if (!banned || banned.size === 0) continue;
        for (const verb of g.verbs) {
          if (!banned.has(verb)) continue;
          const covered = later.some((f, k) =>
            f.revokes.some(
              (r) =>
                (k > 0 || r.pos > g.pos) &&
                r.roles.has(role) &&
                r.kind === g.kind &&
                r.verbs.has(verb) &&
                keyCovers(r.key, g.key),
            ),
          );
          if (!covered) {
            violations.push({ file: per[i].file, role, verb, kind: g.kind, target: g.key.replace(/^obj:|^schema:/, (s) => (s === "obj:" ? "" : "스키마 ")) });
          }
        }
      }
    }

    for (const a of per[i].adp) {
      if (a.action !== "grant") continue;
      for (const role of roles) {
        if (!a.roles.has(role)) continue;
        const banned = FORBIDDEN_VERBS[role][a.kind];
        if (!banned || banned.size === 0) continue;
        for (const schema of a.schemas) {
          for (const verb of a.verbs) {
            if (!banned.has(verb)) continue;
            const covered = later.some((f, k) =>
              f.adp.some(
                (r) =>
                  (k > 0 || r.pos > a.pos) &&
                  r.action === "revoke" &&
                  r.roles.has(role) &&
                  r.kind === a.kind &&
                  r.verbs.has(verb) &&
                  (r.schemas.includes(schema) || r.schemas.includes("*")),
              ),
            );
            if (!covered) {
              violations.push({
                file: per[i].file,
                role,
                verb,
                kind: a.kind,
                target: `기본권한(${schema})`,
              });
            }
          }
        }
      }
    }
  }
  return violations;
}

/* ── 자가진단 ────────────────────────────────────────────────────────────
   readdirSync 보다 **먼저** 끊는다. 저장소가 없어도 검사기 자체는 재 볼 수 있어야 한다.
   여기서 대는 건 규칙 C 뿐이다 — 규칙 A·B 를 같이 태우면 잡아야 할 케이스가
   엉뚱한 규칙에 묻어 잡히고, 그건 규칙 C 를 하나도 증명하지 못한다. */
if (process.argv.includes("--selftest")) {
  const f = (sql, file = "0000_t.sql") => [{ file, sql }];

  // 실제로 있었던 모양 + 앞으로 다시 나면 안 되는 모양
  const MUST_CATCH = [
    ["한 줄 anon INSERT", f("grant insert on public.foo to anon;")],
    ["스키마 전체 all", f("grant all on all tables in schema public to anon;")],
    ["시퀀스 usage/update", f("grant usage, update on all sequences in schema public to anon;")],
    ["authenticated TRUNCATE", f("grant truncate on public.foo to authenticated;")],
    ["섞인 역할 목록(anon 에 insert)", f("grant select, insert on public.foo to anon, authenticated;")],
    ["여러 줄 grant", f("grant insert, update\n  on public.foo\n  to anon;")],
    ["표 단위 all privileges", f("grant all privileges on table public.foo to anon;")],
    ["기본권한 시퀀스", f("alter default privileges in schema public grant usage, update on sequences to anon;")],
    ["기본권한 표 all", f("alter default privileges in schema public grant all on tables to anon;")],
    [
      "다른 스키마 회수로는 못 덮음",
      [
        { file: "0001.sql", sql: "grant insert on private.foo to anon;" },
        { file: "0002.sql", sql: "revoke insert on all tables in schema public from anon;" },
      ],
    ],
    [
      "회수가 **앞** 파일에 있으면 안 덮임(순서 무시 금지)",
      [
        { file: "0001.sql", sql: "revoke insert on all tables in schema public from anon;" },
        { file: "0002.sql", sql: "grant insert on public.foo to anon;" },
      ],
    ],
    ["개별 표 회수로 스키마 전체 부여를 못 덮음", [
      { file: "0001.sql", sql: "grant insert on all tables in schema public to anon;" },
      { file: "0002.sql", sql: "revoke insert on public.foo from anon;" },
    ]],
    [
      "같은 파일 안에서 revoke 뒤 grant (순서를 무시하면 새는 자리)",
      f("revoke insert on public.foo from anon;\ngrant insert on public.foo to anon;"),
    ],
    [
      "기본권한도 같은 파일 안 순서를 본다",
      f(
        "alter default privileges in schema public revoke usage on sequences from anon;\n" +
          "alter default privileges in schema public grant usage on sequences to anon;",
      ),
    ],
  ];

  const MUST_PASS = [
    ["읽기만", f("grant select on public.foo to anon, authenticated;")],
    ["함수 execute", f("grant execute on function public.is_admin(check_user_id uuid) to anon;")],
    ["스키마 usage", f("grant usage on schema public to anon;")],
    ["authenticated I/U/D 는 허용", f("grant insert, update, delete on public.foo to authenticated;")],
    ["컬럼 단위 부여(412e9e5 모양)", f("grant select (id, author_label, title) on public.inspection_notes to anon;")],
    ["service_role 은 대상 아님", f("grant truncate on public.foo to service_role;")],
    ["주석 처리된 grant", f("-- grant insert on public.foo to anon;\nselect 1;")],
    ["블록 주석 안의 grant", f("/* grant insert on public.foo to anon; */\nselect 1;")],
    ["authenticated 시퀀스 usage 는 허용", f("grant usage on all sequences in schema public to authenticated;")],
    ["기본권한 회수", f("alter default privileges in schema public revoke usage, update on sequences from anon;")],
    [
      "나중 파일이 스키마 전체로 회수",
      [
        { file: "0001.sql", sql: "grant insert, update on public.foo to anon;" },
        {
          file: "0002.sql",
          sql: "revoke insert, update, delete, truncate, references, trigger, maintain\n  on all tables in schema public from anon;",
        },
      ],
    ],
    [
      "같은 파일 안에서 grant 뒤 revoke",
      f("grant insert on public.foo to anon;\nrevoke insert on public.foo from anon;"),
    ],
    [
      "실제 저장소 모양: 20260806171024 전문",
      f(
        "revoke insert, update, delete, truncate, references, trigger, maintain\n" +
          "  on all tables in schema public from anon;\n" +
          "revoke usage, update on all sequences in schema public from anon;\n" +
          "alter default privileges in schema public revoke usage, update on sequences from anon;\n" +
          "revoke truncate, references, trigger, maintain\n" +
          "  on all tables in schema public from authenticated;\n",
      ),
    ],
  ];

  let bad = 0;
  for (const [name, files] of MUST_CATCH) {
    const hits = findAnonWriteGrantViolations(files);
    if (hits.length === 0) {
      bad += 1;
      console.error(`  ✗ 못 잡음(잡아야 함): ${name}`);
    }
  }
  for (const [name, files] of MUST_PASS) {
    const hits = findAnonWriteGrantViolations(files);
    if (hits.length > 0) {
      bad += 1;
      console.error(
        `  ✗ 잘못 잡음(통과해야 함): ${name} → ` +
          hits.map((h) => `${h.role}/${h.verb}/${h.target}`).join(", "),
      );
    }
  }
  console.log(
    bad === 0
      ? `${TAG} 자가진단 통과 — 규칙 C 단독. 잡아야 할 ${MUST_CATCH.length}건 전부 잡고, ` +
          `통과해야 할 ${MUST_PASS.length}건 전부 통과`
      : `${TAG} 자가진단 실패 ${bad}건`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

/* ── 본 검사 ──────────────────────────────────────────────────────────────
   `findAnonWriteGrantViolations` 를 import 만 해도 전수 검사가 돌면 곤란하다.
   직접 실행할 때만 돈다. */
const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());

if (invokedDirectly) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.error(`${TAG} FAIL — supabase/migrations 에 .sql 파일이 없습니다.`);
    process.exit(1);
  }

  /* 한 번만 읽어 규칙 A·B(주석 제거본)와 규칙 C(원본)가 나눠 쓴다. */
  const raw = files.map((file) => ({ file, sql: readFileSync(join(dir, file), "utf8") }));

  const parsed = raw.map(({ file, sql: rawSql }) => {
    const sql = stripComments(rawSql);
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

  /* ── 규칙 C: anon 에게 쓰기 권한을 주고 있지 않은가 ─────────────────────── */
  const writeGrants = findAnonWriteGrantViolations(raw);

  if (writeGrants.length > 0) {
    console.error(`${TAG} FAIL — 최종 상태에서 회수되지 않은 쓰기 권한 부여 ${writeGrants.length}건`);
    for (const v of writeGrants) {
      console.error(`  ✗ ${v.file}\n      ${v.role} 에게 ${v.kind} ${v.target} 의 ${v.verb.toUpperCase()} 권한이 남습니다.`);
    }
    console.error(
      `\n  anon 은 브라우저 번들에 실려 나가는 publishable 키의 역할입니다.` +
        `\n  RLS 는 **행**만 막습니다 — TRUNCATE 는 RLS 의 대상이 아니라 GRANT 만이 막습니다.` +
        `\n  (2026-08-06 실측: 정책 없는 RLS 표에서 anon 의 TRUNCATE 가 5행을 통째로 지웠습니다.)` +
        `\n  읽기만 필요하면 select 만 주세요. 쓰기는 service_role 로 하세요:` +
        `\n      grant select on <schema>.<객체> to anon, authenticated;` +
        `\n  authenticated 는 I/U/D 는 되지만 TRUNCATE/REFERENCES/TRIGGER/MAINTAIN 은 안 됩니다.` +
        `\n  선례: supabase/migrations/20260806171024_revoke_anon_write_grants.sql`,
    );
    process.exit(1);
  }

  const total = parsed.reduce(
    (s, p) => s + new Set(p.dropped.filter((n) => p.created.includes(n))).size,
    0,
  );
  console.info(
    `${TAG} PASS — 저장소에 있는 마이그레이션 파일 ${files.length}개만 대상 · ` +
      `재생성 객체 ${total}건 GRANT 확인 · 함수 revoke ${revokeChecked}건 public 포함 확인 · ` +
      `anon·authenticated 쓰기 부여 잔존 0건`,
  );
  console.info(
    `  ※ 범위: 파일이 없는 채 적용된 마이그레이션은 여기서 안 보입니다` +
      `(check-migration-ledger.mjs 가 셉니다).` +
      `\n  ※ 규칙 C 는 파일에 적힌 grant 만 봅니다. 프로젝트 기본권한이 낸 구멍은 못 봅니다` +
      `\n     — 2026-08-06 의 anon 쓰기 76개가 정확히 그렇게 열렸고(파일 grant 0건),` +
      ` 그건 DB 를 직접 세야 보입니다.`,
  );
}
