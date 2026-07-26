#!/usr/bin/env node
/**
 * N6 — 리다이렉트 맵 검증 게이트
 *
 * lib/seo/redirect-map.ts 의 규칙표가 실제 라우트와 어긋나지 않는지 본다.
 * 리다이렉트는 틀려도 화면이 깨지지 않아서 사람이 알아채기 어렵다. 실제로
 * "/reports": "/analysis" 규칙 하나가 월간 리포트 허브를 통째로 가리고 있었고,
 * 사이트맵과 llms.txt 가 그 URL 을 광고하는 동안 아무 에러도 나지 않았다.
 * 그 사고를 잡는 것이 아래 검사 1번이다.
 *
 * 검사 항목
 *  1. from 이 아직 살아 있는 라우트인가 (미들웨어가 파일 시스템보다 먼저 돌아
 *     멀쩡한 페이지를 가리는 경우) — 가장 중요한 검사
 *  2. to 가 실존 라우트인가 (정적/동적 모두 매칭)
 *  3. 2단 홉 — to 가 다른 규칙의 from 인가
 *  4. from === to 자기 참조
 *  5. 형식 — 앞 "/", 뒤 슬래시 없음, from 에 쿼리·해시 없음
 *  6. reason·since 가 채워져 있는가 (since 는 YYYY-MM-DD, 미래 날짜 금지)
 *  7. 배선 — middleware.ts 가 이 표를 import 해서 쓰는가
 *
 * from 중복은 redirect-map.ts 가 모듈 로드 시점에 스스로 던지므로, 이 스크립트가
 * import 하는 순간 함께 잡힌다(아래 8번에서 개수로 한 번 더 확인).
 */

/* Node 가 .ts 를 직접 읽을 때 나오는 MODULE_TYPELESS_PACKAGE_JSON 경고를 지운다.
   게이트 출력에 섞이면 실제 실패처럼 보인다. */
process.removeAllListeners("warning");

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = path.join(ROOT, "app");

const errors = [];
const fail = (msg) => errors.push(msg);

/* ── 1. 실제 라우트 수집 ────────────────────────────────────────────────────
   Next 앱 라우터 규칙: (group) 은 URL 에 안 나오고, @slot·_private 은 라우트가
   아니다. [id]·[...all]·[[...opt]] 는 동적 세그먼트. */
const PAGE_FILES = ["page.tsx", "page.ts", "page.jsx", "page.js"];
const ROUTE_FILES = ["route.ts", "route.js", "route.tsx"];

const staticRoutes = new Set();
const dynamicRoutes = []; // { pattern: RegExp, source: string }

function hasRouteFile(dir) {
  return [...PAGE_FILES, ...ROUTE_FILES].some((f) => existsSync(path.join(dir, f)));
}

function toRegExp(urlPath) {
  const parts = urlPath.split("/").filter(Boolean);
  let body = "";
  for (const seg of parts) {
    if (/^\[\[\.\.\..+\]\]$/.test(seg)) body += "(?:/.+)?"; // [[...opt]] — 없어도 됨
    else if (/^\[\.\.\..+\]$/.test(seg)) body += "/.+"; // [...all] — 한 조각 이상
    else if (/^\[.+\]$/.test(seg)) body += "/[^/]+";
    else body += `/${seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  }
  return new RegExp(`^${body || "/"}$`);
}

function walk(dir, urlPath) {
  if (hasRouteFile(dir)) {
    const url = urlPath || "/";
    if (url.includes("[")) dynamicRoutes.push({ pattern: toRegExp(url), source: url });
    else staticRoutes.add(url);
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith("_") || name.startsWith("@") || name === "node_modules") continue;
    const isGroup = /^\(.*\)$/.test(name);
    walk(path.join(dir, name), isGroup ? urlPath : `${urlPath}/${name}`);
  }
}

if (!existsSync(APP_DIR)) {
  console.error("✗ app/ 디렉터리를 찾을 수 없습니다.");
  process.exit(1);
}
walk(APP_DIR, "");

function matchesDynamic(p) {
  return dynamicRoutes.find((r) => r.pattern.test(p));
}

/* ── 2. 규칙표 읽기 ─────────────────────────────────────────────────────────
   .ts 를 그대로 import 한다(Node 22 의 타입 스트리핑). 정규식으로 긁는 것보다
   정확하고, 표가 스스로 던지는 중복 검사도 같이 태울 수 있다.
   redirect-map.ts 는 의존성이 하나도 없어서 이게 가능하다. */
const MAP_PATH = path.join(ROOT, "lib/seo/redirect-map.ts");
let REDIRECT_RULES;
let EXACT_REDIRECTS;
try {
  const mod = await import(`file://${MAP_PATH}`);
  REDIRECT_RULES = mod.REDIRECT_RULES;
  EXACT_REDIRECTS = mod.EXACT_REDIRECTS;
} catch (err) {
  console.error(
    `✗ lib/seo/redirect-map.ts 를 읽지 못했습니다 — ${err.message}\n` +
      `  현재 Node: ${process.version} · 필요: v22.18 이상(.ts 타입 스트리핑 기본 활성)`,
  );
  process.exit(1);
}

if (!Array.isArray(REDIRECT_RULES) || REDIRECT_RULES.length === 0) {
  console.error("✗ REDIRECT_RULES 가 비어 있습니다.");
  process.exit(1);
}

const sources = new Set(REDIRECT_RULES.map((r) => r.from));
const stripQuery = (p) => p.split("?")[0].split("#")[0];
const today = new Date().toISOString().slice(0, 10);

for (const rule of REDIRECT_RULES) {
  const { from, to, reason, since } = rule;

  // 5. 형식
  if (!from.startsWith("/")) fail(`from "${from}" — "/" 로 시작해야 합니다.`);
  if (from.length > 1 && from.endsWith("/")) fail(`from "${from}" — 뒤 슬래시를 빼세요(미들웨어는 벗긴 경로로 조회합니다).`);
  if (/[?#]/.test(from)) fail(`from "${from}" — 쿼리·해시는 넣을 수 없습니다(정확 경로만 비교합니다).`);
  if (!to.startsWith("/")) fail(`to "${to}" (from "${from}") — 사이트 내부 경로만 허용합니다.`);

  // 4. 자기 참조
  if (stripQuery(to) === from) fail(`"${from}" 이 자기 자신으로 리다이렉트합니다(무한 루프).`);

  // 1. from 이 살아 있는 라우트인가 — 가장 중요한 검사
  if (staticRoutes.has(from)) {
    fail(
      `"${from}" 은 실제로 살아 있는 라우트입니다(app${from}/page.tsx 등). ` +
        `미들웨어가 파일 시스템 라우트보다 먼저 돌기 때문에 이 규칙이 그 페이지를 통째로 가립니다. ` +
        `규칙을 지우거나, 페이지를 지우세요.`,
    );
  } else {
    const shadowed = matchesDynamic(from);
    if (shadowed) {
      fail(
        `"${from}" 은 동적 라우트 "${shadowed.source}" 에 잡히는 경로입니다. ` +
          `이 규칙이 그 라우트의 해당 URL 을 가립니다.`,
      );
    }
  }

  // 2. to 가 실존 라우트인가
  const target = stripQuery(to);
  if (!staticRoutes.has(target) && !matchesDynamic(target)) {
    fail(`to "${to}" (from "${from}") — 대응하는 라우트가 없습니다. 리다이렉트가 404 로 떨어집니다.`);
  }

  // 3. 2단 홉
  if (sources.has(target)) {
    fail(
      `"${from}" → "${to}" 는 2단 홉입니다("${target}" 이 다시 "${EXACT_REDIRECTS[target]}" 로 갑니다). ` +
        `최종 목적지로 직행시키세요 — 홉이 늘수록 색인 이관이 새어 나갑니다.`,
    );
  }

  // 6. 메타데이터
  if (!reason || !reason.trim()) fail(`"${from}" — reason 이 비었습니다. 왜 죽은 경로인지 적어야 나중에 지울지 판단할 수 있습니다.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since ?? "")) fail(`"${from}" — since 는 YYYY-MM-DD 형식이어야 합니다(받은 값: ${JSON.stringify(since)}).`);
  else if (Number.isNaN(Date.parse(since))) fail(`"${from}" — since "${since}" 는 존재하지 않는 날짜입니다.`);
  else if (since > today) fail(`"${from}" — since "${since}" 가 미래입니다(오늘: ${today}).`);
}

// 8. 평탄화 손실 확인 (표에는 있는데 조회표에 없는 항목)
if (Object.keys(EXACT_REDIRECTS).length !== REDIRECT_RULES.length) {
  fail(
    `EXACT_REDIRECTS(${Object.keys(EXACT_REDIRECTS).length}개) 와 REDIRECT_RULES(${REDIRECT_RULES.length}개) 의 ` +
      `개수가 다릅니다 — from 중복으로 규칙이 조용히 덮였을 수 있습니다.`,
  );
}

// 7. 배선 — 미들웨어가 이 표를 실제로 쓰는가
const middlewareSrc = readFileSync(path.join(ROOT, "middleware.ts"), "utf8");
if (!/from\s+"@\/lib\/seo\/redirect-map"/.test(middlewareSrc)) {
  fail("middleware.ts 가 @/lib/seo/redirect-map 을 import 하지 않습니다 — 표를 만들어 두고 안 쓰는 상태입니다.");
}
if (!/EXACT_REDIRECTS\[/.test(middlewareSrc)) {
  fail("middleware.ts 에서 EXACT_REDIRECTS 조회가 보이지 않습니다 — 리다이렉트가 실제로 동작하지 않습니다.");
}
if (!/legacyRedirectStatus\(/.test(middlewareSrc)) {
  fail("middleware.ts 가 legacyRedirectStatus() 를 쓰지 않습니다 — 상태 코드 정책이 표와 따로 놉니다.");
}

if (errors.length > 0) {
  console.error(`✗ 리다이렉트 맵 검사 실패 — ${errors.length}건`);
  for (const e of errors) console.error(`  · ${e}`);
  process.exit(1);
}

console.log(
  `✓ 리다이렉트 맵 검사 통과 — 규칙 ${REDIRECT_RULES.length}개 전부 1홉 · 실라우트 타깃 · ` +
    `살아 있는 페이지를 가리지 않음 (정적 라우트 ${staticRoutes.size} · 동적 ${dynamicRoutes.length} 대조)`,
);
