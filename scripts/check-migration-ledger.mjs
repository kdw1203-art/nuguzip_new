#!/usr/bin/env node
/**
 * 원장 ↔ 파일 대조 — "적용은 됐는데 파일이 없는 마이그레이션" 을 드러낸다.
 *
 * ── 왜 있나 ────────────────────────────────────────────────────────────
 * 이 프로젝트의 DB 변경은 두 경로로 들어간다.
 *   (1) supabase/migrations/*.sql 파일을 쓰고 적용
 *   (2) MCP apply_migration 으로 바로 적용
 * (2) 는 원장(supabase_migrations.schema_migrations)에는 남지만 저장소에는 안 남는다.
 * 그래서 스키마에는 있는데 저장소 어디에도 설명이 없는 객체가 생긴다.
 * 2026-08-06 에 이걸 전수로 세어 봤더니 파일이 없는 채 적용된 것이 11건이 아니라
 * 그보다 훨씬 많았다. 그 전에는 "11건" 이라고 적혀 있었고, 그건 눈으로 몇 개
 * 찾아본 결과였지 센 결과가 아니었다.
 *
 * check-migration-grants.mjs 는 이걸 못 잡는다. 그건 **파일만** 읽기 때문이다.
 * 파일이 없으면 볼 것도 없으니 조용히 통과한다 — 파일 79개를 다 봤다고 적으면서.
 *
 * ── 어떻게 보나 ────────────────────────────────────────────────────────
 * supabase/ledger-snapshot.json 에 원장을 떠 놓았다. 이 컨테이너의 Node 는
 * Supabase 에 닿지 못하므로 실시간 조회는 불가능하고, 조회를 시도하는 검사는
 * 영구 SKIP→WARN 이 되어 아무도 안 보게 된다. 그래서 스냅샷을 쓴다.
 *
 * 스냅샷의 각 원장 행에는 그 SQL 에서 뽑은 객체가 "<동사>:<이름>" 으로 들어 있다.
 * 여기서 c(create)/a(alter) 인 객체만 "파일이 설명해야 할 것" 으로 본다.
 * d(drop) 만 있는 객체는 결손이 아니다 — 기준선 이전에 만들어진 걸 지운 것뿐이라
 * 저장소에 정의가 없는 게 정상이다(예: drop_duplicate_indexes 의
 * public.banned_words_word_idx). 동사를 안 보고 세면 이런 게 전부 결손으로 잡힌다.
 *
 * 만들었다가 나중에 지운 객체도 결손이 아니다. 다만 "마지막 동사가 drop 인가" 로
 * 판정하면 안 된다 — 함수는 오버로드 하나만 지워도 마지막 매칭이 drop 이 된다.
 * (public.refresh_market_region_monthly 이 실제로 그렇다. 동사로 판정했으면 살아 있는
 *  함수의 결손을 조용히 숨겼을 것이다.) 그래서 스냅샷의 absent_now 는 동사가 아니라
 * 실측이다 — 스냅샷 뜬 날 DB 카탈로그에 그 이름이 있었는지 본 결과다.
 *
 * 로컬 파일 쪽도 **스냅샷에 적힌 그 정규식 그대로** 돌린다. 검사기가 정규식을
 * 따로 들고 있으면 언젠가 갈라지고, 갈라지면 없는 결손이 만들어진다.
 * 실제로 두 번 그랬다. create unique index 를 한쪽에서만 잡아서 로컬 객체가
 * 157 개로 세어졌고(고친 뒤 224), 주석을 로컬에서만 지워서 원장 객체가
 * 347 개로 세어졌다(고친 뒤 331).
 *
 * 이름 비교는 스키마를 떼고 마지막 마디로 한다. 넓게 잡는 쪽이다.
 * 좁게 잡으면(스키마까지 일치 요구) 같은 객체가 다른 스키마 표기로 적힌 것들이
 * 전부 결손으로 잡혀서, 없는 버그를 만들어 낸다.
 *
 * ── 판정 ───────────────────────────────────────────────────────────────
 * 이미 알고 있는 결손은 스냅샷의 known_unmirrored 에 근거(원장 version)와 함께
 * 적혀 있다. 이 검사는 **거기 없는 새 결손**만 FAIL 시킨다.
 * 새 결손이 생기는 경우는 둘뿐이다.
 *   * 원장이 만들었다고 기록한 객체를 정의하던 파일이 지워졌거나 이름이 바뀌었다
 *   * 결손이 늘었는데 목록에 적지 않았다
 * 둘 다 지금 손대서 생긴 일이므로, 지금 걸리는 게 맞다.
 *
 * 이미 있던 결손은 FAIL 시키지 않는다. 대신 개수를 PASS 줄에 적는다.
 * 늘 빨간 게이트는 아무도 안 보고, 아무도 안 보는 게이트는 없는 것과 같다.
 *
 * ── 이 검사가 못 잡는 것 (중요) ─────────────────────────────────────────
 * 스냅샷을 뜬 날 이후에 MCP 로 적용된 마이그레이션은 원장에만 있고
 * 스냅샷에도 파일에도 없다. 그러면 대조할 근거 자체가 없어서 못 잡는다.
 * 이건 구현을 고쳐서 없앨 수 있는 한계가 아니라 오프라인 대조라는 방식의 한계다.
 * 그래서 실행할 때마다 마지막 줄에 적어 둔다. 안 적으면 이 검사가 통과했다는 게
 * "빠진 마이그레이션이 없다" 로 읽히고, 그건 거짓 안전망이다.
 *
 * 사용: node ./scripts/check-migration-ledger.mjs · npm run check:migration-ledger
 */
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");
const snapshotPath = join(root, "supabase", "ledger-snapshot.json");
const TAG = "[check-migration-ledger]";

/* ── 스냅샷 읽기 ──────────────────────────────────────────────────────── */
let snap;
try {
  snap = JSON.parse(readFileSync(snapshotPath, "utf8"));
} catch (err) {
  console.error(
    `${TAG} FAIL — supabase/ledger-snapshot.json 을 읽지 못했습니다: ${err.message}\n` +
      `  이 파일이 없으면 대조할 원장이 없습니다. 삭제된 게 아니라면 다시 뜨세요` +
      `(방법은 파일 안 readme 에 있습니다).`,
  );
  process.exit(1);
}

/* 스냅샷이 손으로 고쳐졌는지 본다. 원장과 어긋난 스냅샷은 낡은 코드보다 위험하다 —
   대조는 계속 돌면서 틀린 답을 낸다. */
const rendered = snap.migrations
  .map((m) =>
    [m.version, m.name, m.bytes, m.md5, m.statements, [...m.objects].sort().join(",")].join("|"),
  )
  .join("\n");
const actualMd5 = createHash("md5").update(rendered, "utf8").digest("hex");
if (actualMd5 !== snap.content_md5) {
  console.error(
    `${TAG} FAIL — ledger-snapshot.json 의 content_md5 가 본문과 맞지 않습니다.\n` +
      `      적힌 값: ${snap.content_md5}\n` +
      `      실제 값: ${actualMd5}\n` +
      `  migrations 배열을 손으로 고쳤다면 되돌리세요. 원장이 실제로 바뀌어서 다시 떴다면` +
      `\n  content_md5 도 같이 갱신해야 합니다(계산식은 파일 안 readme 에 있습니다).`,
  );
  process.exit(1);
}

const stripRe = new RegExp(snap.extract.strip_comments_regex, "g");
const objRe = new RegExp(snap.extract.object_regex, snap.extract.flags);

/** 스키마를 떼고 소문자로. 비교는 마지막 마디로만 한다. */
const bare = (name) => name.replace(/"/g, "").toLowerCase().split(".").pop();

/* ── 원장 쪽: 파일이 설명해야 할 객체 ─────────────────────────────────── */
/** bareName -> { versions: Set<version>, full: Set<원장 표기> } */
const required = new Map();
for (const m of snap.migrations) {
  for (const tok of m.objects) {
    const [verb, name] = [tok.slice(0, 1), tok.slice(2)];
    if (verb !== "c" && verb !== "a") continue; // drop 만 하는 참조는 결손이 아니다
    const key = bare(name);
    const entry = required.get(key) ?? { versions: new Set(), full: new Set() };
    entry.versions.add(m.version);
    entry.full.add(name);
    required.set(key, entry);
  }
}

/* 지금은 존재하지 않는 객체를 뺀다. 목록이 원장과 어긋나 있으면(오타·낡음) 조용히
   빼는 게 아니라 걸린다 — 안 걸리면 오타 하나가 결손 하나를 영구히 숨긴다. */
const absentDecl = snap.absent_now?.objects ?? [];
const absent = new Set(absentDecl.map(bare));
const staleAbsent = [...absent].filter((k) => !required.has(k)).sort();
if (staleAbsent.length > 0) {
  console.error(
    `${TAG} FAIL — ledger-snapshot.json 의 absent_now 에 원장이 만든 적 없는 이름이 있습니다: ` +
      `${staleAbsent.join(", ")}\n` +
      `  이 목록은 "원장이 만들었지만 지금은 DB 에 없는 것"만 담아야 합니다.` +
      ` 오타이거나 낡은 항목입니다.`,
  );
  process.exit(1);
}
const requiredNow = new Map([...required].filter(([k]) => !absent.has(k)));

/* ── 로컬 쪽: 실제로 정의하는 객체 ────────────────────────────────────── */
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`${TAG} FAIL — supabase/migrations 에 .sql 파일이 없습니다.`);
  process.exit(1);
}

/** bareName -> Set<파일명> (c/a 동사로 정의한 것만) */
const defined = new Map();
for (const file of files) {
  const body = readFileSync(join(dir, file), "utf8").replace(stripRe, "");
  objRe.lastIndex = 0;
  for (const m of body.matchAll(objRe)) {
    const verb = /^drop/i.test(m[1]) ? "d" : /^alter/i.test(m[1]) ? "a" : "c";
    if (verb === "d") continue;
    const key = bare(m[2]);
    const set = defined.get(key) ?? new Set();
    set.add(file);
    defined.set(key, set);
  }
}

/* ── 대조 ─────────────────────────────────────────────────────────────── */
const missing = [...requiredNow.keys()].filter((k) => !defined.has(k)).sort();

const known = new Map((snap.known_unmirrored ?? []).map((e) => [e.object, e]));
const isNew = missing.filter((k) => !known.has(k));
const nowCovered = [...known.keys()].filter((k) => !missing.includes(k)).sort();

const limitLine =
  `  ※ 한계: 이 검사는 ${snap.measured_at} 에 뜬 스냅샷과 대조합니다. 그 이후 MCP 로 적용된\n` +
  `     마이그레이션은 원장에만 있어 여기서 보이지 않습니다. 통과했다는 것이 "빠진\n` +
  `     마이그레이션이 없다"는 뜻은 아닙니다. DDL 은 apply_migration 으로 넣고 파일도 같이 남기세요.`;

if (isNew.length > 0) {
  console.error(
    `${TAG} FAIL — 원장이 만들었다고 기록했는데 저장소 어디에도 정의가 없는 객체 ${isNew.length}건` +
      ` (known_unmirrored 에 없는 새 결손)`,
  );
  for (const key of isNew) {
    const e = requiredNow.get(key);
    console.error(
      `  ✗ ${[...e.full].sort().join(" / ")}\n` +
        `      원장 version: ${[...e.versions].sort().join(", ")}`,
    );
  }
  console.error(
    `\n  둘 중 하나입니다:` +
      `\n    * 이 객체를 정의하던 마이그레이션 파일을 지웠거나 이름을 바꿨다 → 되돌리세요.` +
      `\n      (이미 적용된 마이그레이션 파일은 고쳐 쓰는 게 아니라 뒤에 한 장 더 붙여 고칩니다.)` +
      `\n    * MCP 로 적용하고 파일을 안 남겼다 → 원장 statements 원문 그대로 파일을 만드세요.` +
      `\n      선례: supabase/migrations/20260805225415_etl_freshness_cron_cadence_aware.sql` +
      `\n            (머리말에 "원장 복원" 이라고 밝히고 SQL 은 한 글자도 고치지 않습니다.)` +
      `\n  결손인 걸 알면서 지금 못 고치는 경우라면 supabase/ledger-snapshot.json 의` +
      `\n  known_unmirrored 에 근거(원장 version)와 함께 적으세요. 조용히 넘기지는 마세요.` +
      `\n${limitLine}`,
  );
  process.exit(1);
}

if (nowCovered.length > 0) {
  console.info(
    `${TAG} 참고 — known_unmirrored 에 적혀 있지만 지금은 파일이 있는 객체 ${nowCovered.length}건:` +
      `\n      ${nowCovered.join(", ")}` +
      `\n  supabase/ledger-snapshot.json 의 known_unmirrored 에서 빼 주세요.` +
      ` 목록이 실제보다 크면 그만큼 못 보는 범위가 넓어집니다.`,
  );
}

console.info(
  `${TAG} PASS — 원장 ${snap.ledger_rows}행(${snap.baseline_version} 이후, ${snap.measured_at} 스냅샷) · ` +
    `파일 ${files.length}개 · 원장이 만들고 지금도 있는 객체 ${requiredNow.size}개` +
    `(만들었다 지운 ${absent.size}개 제외) 중 ` +
    `파일에 정의된 것 ${requiredNow.size - missing.length}개 · ` +
    `미러링 안 된 것 ${missing.length}개(모두 known_unmirrored 에 기록됨)`,
);
console.info(limitLine);
