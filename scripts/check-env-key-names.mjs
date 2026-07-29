#!/usr/bin/env node
/**
 * envKey 이름 게이트.
 *
 * 이 저장소에는 공공데이터 소스를 나열하는 카탈로그가 여럿 있고(lib/datasources,
 * lib/public-data, lib/public-data-sources, lib/map/data-workspace-catalog …),
 * 각 항목마다 `envKey: "XXX_API_KEY"` 가 붙어 있다. 이 이름은 두 곳에서 쓰인다.
 *
 *  1) 화면의 "연동됨 / 미연동" 상태 배지를 계산할 때 `process.env[envKey]` 로.
 *  2) 소유자에게 "Vercel 에 이 이름으로 키를 넣으세요" 라고 안내할 때.
 *
 * 그래서 이름이 실제 코드가 읽는 이름과 어긋나면 **양쪽으로 거짓말이 된다.**
 * 키를 정확히 넣어도 배지는 영원히 "미연동"이고, 반대로 아무 코드도 읽지 않는
 * 이름이 "연동됨"으로 켜지기도 한다. 2026-07-28 에 실제로 세 개가 그랬다 —
 * KOSIS_SERVICE_KEY(진짜는 KOSIS_API_KEY), REB_SERVICE_KEY(진짜는
 * REB_OPENAPI_KEY), 그리고 아무 데서도 읽지 않는 SCHOOLINFO_API_KEY.
 * 소유자는 그 이름들이 적힌 안내 문서를 받아 Vercel 에 그대로 입력하기
 * 직전이었다.
 *
 * 검사 방법은 단순하다: 카탈로그에 적힌 envKey 를 모아서, 저장소 어딘가에
 * `process.env.NAME` 또는 `process.env["NAME"]` 로 **읽는 코드가 실제로
 * 있는지** 본다. 없으면 실패. 오탐 여지가 거의 없다 — env 를 읽는 방법이
 * 이 두 가지뿐이기 때문이다.
 *
 * 아직 어댑터가 없어서 읽는 코드가 없는 게 정상인 이름은 UNWIRED 에 이유와
 * 함께 적는다. 적어 두는 행위 자체가 "이건 키를 넣어도 아직 동작하지 않는다"는
 * 사실을 코드에 남기는 것이다.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

/**
 * 읽는 코드가 아직 없는 게 **알려진 사실**인 이름 — 이유를 반드시 적는다.
 * 여기 있는 이름은 카탈로그에서 "연동됨"으로 켜져서는 안 된다.
 */
const UNWIRED = {
  SCHOOLINFO_API_KEY:
    "학교알리미 어댑터 미구현 — 키를 넣어도 값은 비어 있다. lib/public-data/index.ts 의 ADAPTER_READY.schools = false 가 이 사실을 상태 배지에 반영한다.",
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "coverage",
  "playwright-report",
  "test-results",
  "out",
  "dist",
]);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(p);
    } else if (/\.(tsx?|mjs|cjs|js)$/.test(e.name)) {
      yield p;
    }
  }
}

const files = [...walk(ROOT)];

/* ── 1. 카탈로그에 적힌 envKey 를 모은다 ───────────────────────────── */
/* `envKey: "NAME"` 과, envKey 유니언 타입의 멤버(`| "NAME"`) 둘 다 본다. */
const declared = new Map(); // NAME -> ["path:line", ...]

const SELF = path.resolve(ROOT, "scripts/check-env-key-names.mjs");

for (const file of files) {
  /* 이 파일 자신의 설명 주석에도 envKey 예시가 들어 있다 — 검사 대상이 아니다. */
  if (path.resolve(file) === SELF) continue;
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("envKey")) continue;
  const lines = src.split("\n");

  let inUnion = false;
  lines.forEach((line, i) => {
    const where = `${path.relative(ROOT, file)}:${i + 1}`;

    /* "NONE" 은 키가 필요 없는 소스를 뜻하는 표식이다 — 환경변수 이름이 아니다. */
    const direct = /\benvKey:\s*"([A-Z][A-Z0-9_]*)"/.exec(line);
    if (direct && direct[1] !== "NONE") {
      if (!declared.has(direct[1])) declared.set(direct[1], []);
      declared.get(direct[1]).push(where);
    }

    /* `envKey:` 뒤에 값이 없으면 유니언 타입 선언이 여러 줄로 이어진다. */
    if (/\benvKey\??:\s*$/.test(line.trimEnd())) inUnion = true;
    else if (inUnion) {
      const member = /^\s*\|?\s*"([A-Z][A-Z0-9_]*)"\s*$/.exec(line.replace(/;$/, ""));
      if (member) {
        if (member[1] !== "NONE") {
          if (!declared.has(member[1])) declared.set(member[1], []);
          declared.get(member[1]).push(where);
        }
      }
      if (/;\s*$/.test(line)) inUnion = false;
      else if (!member) inUnion = false;
    }
  });
}

if (declared.size === 0) {
  console.error("[check-env-key-names] envKey 를 하나도 읽지 못했습니다 — 파서가 깨졌을 수 있습니다.");
  process.exit(1);
}

/* ── 2. 실제로 process.env 로 읽는 이름을 모은다 ──────────────────── */
const read = new Set();
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("process.env")) continue;
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) read.add(m[1]);
  for (const m of src.matchAll(/process\.env\[\s*"([A-Z][A-Z0-9_]*)"\s*\]/g)) read.add(m[1]);
}

/* ── 3. 대조 ──────────────────────────────────────────────────────── */
const missing = [];
const staleUnwired = [];

for (const [name, sites] of declared) {
  if (read.has(name)) {
    if (UNWIRED[name]) staleUnwired.push(name);
    continue;
  }
  if (UNWIRED[name]) continue;
  missing.push({ name, sites });
}

if (missing.length) {
  console.error("[check-env-key-names] 아무 코드도 읽지 않는 envKey:");
  for (const { name, sites } of missing) {
    console.error(`  ${name}`);
    for (const s of sites) console.error(`    ← ${s}`);
  }
  console.error(
    "\n이 이름들은 상태 배지와 소유자 안내 문서 양쪽에서 거짓이 됩니다." +
      "\n코드가 실제로 읽는 이름으로 고치거나, 아직 어댑터가 없는 것이라면" +
      "\nscripts/check-env-key-names.mjs 의 UNWIRED 에 이유와 함께 적으세요.",
  );
  process.exit(1);
}

if (staleUnwired.length) {
  console.error(
    "[check-env-key-names] UNWIRED 에 적혀 있는데 이제는 읽는 코드가 있습니다: " +
      staleUnwired.join(", ") +
      "\n어댑터가 생겼다면 UNWIRED 에서 지우세요 — 낡은 예외는 그 자체로 거짓 정보입니다.",
  );
  process.exit(1);
}

const unwiredNote = Object.keys(UNWIRED)
  .filter((n) => declared.has(n))
  .join(", ");
console.log(
  `[check-env-key-names] OK — envKey ${declared.size}개 전부 실제 process.env 참조와 일치` +
    (unwiredNote ? ` (미구현 예외: ${unwiredNote}).` : "."),
);
