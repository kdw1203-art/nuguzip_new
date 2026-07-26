#!/usr/bin/env node
/**
 * 내부 링크 목적지 존재 검사 (href 한정)
 *
 * ── 왜 있나 ────────────────────────────────────────────────────────────────
 * 2026-07-26 에 전수 점검을 해 보니, 앱 안에서 링크로 쓰이는 경로 중 상당수가
 * 이 앱에 아예 없는 경로였다. 몇 가지만 적으면:
 *   - 홈 퀵메뉴 "청약" → `/presale`  (라우트도, 리다이렉트 규칙도 없음 → 404)
 *   - 내 활동 북마크    → `/experts/{id}` `/groups/{id}` `/market/{id}`
 *   - 임장노트 작성 CTA → `/inspection/create`  (실제는 /notes/new)
 *   - AI 실행 기록      → `/ai-analysis/{tool}` (tool 은 라우트가 아니라 엔진 식별자)
 * 전부 타입 검사도 빌드도 통과한다. 링크는 틀려도 컴파일이 안 깨지기 때문이다.
 * 링크 크롤 게이트(scripts/check-links.mjs)는 실제로 렌더된 <a> 만 따라가므로
 * API 응답 안의 url, 로그인해야 보이는 화면, 죽은 모듈은 닿지 않는다.
 *
 * ── 무엇을 보나 ───────────────────────────────────────────────────────────
 * 소스에 **리터럴로** 적힌 `href` 값만 본다(`href:` `href=` 그리고 `...Href:`).
 * fetch 대상 URL·외부 API 경로·프리픽스 표는 일부러 건드리지 않는다 — 오탐이
 * 섞이는 순간 게이트는 무시당하고, 무시당하는 게이트는 없느니만 못하다.
 *
 * 판정은 세 단계다.
 *   1. app/ 아래 실제 라우트(정적·동적)와 맞춰 본다.
 *   2. 안 맞으면 lib/seo/redirect-map.ts 의 정확 일치 규칙을 본다.
 *      (리다이렉트로 살아 있는 레거시 링크는 404 가 아니다 — 통과시킨다)
 *   3. 그래도 안 맞으면 middleware.ts 가 따로 처리하는 동적 패턴을 본다.
 * 템플릿 리터럴의 `${...}` 는 동적 세그먼트 하나로 친다.
 */

/* .ts 직접 로드 시의 MODULE_TYPELESS_PACKAGE_JSON 경고가 게이트 출력에
   섞이면 실패처럼 보인다. */
process.removeAllListeners("warning");

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = path.join(ROOT, "app");

const PAGE_FILES = ["page.tsx", "page.ts", "page.jsx", "page.js"];
const ROUTE_FILES = ["route.ts", "route.js", "route.tsx"];

const staticRoutes = new Set();
const dynamicRoutes = []; // RegExp

function hasRouteFile(dir) {
  return [...PAGE_FILES, ...ROUTE_FILES].some((f) => existsSync(path.join(dir, f)));
}

function toRegExp(urlPath) {
  const parts = urlPath.split("/").filter(Boolean);
  let body = "";
  for (const seg of parts) {
    if (/^\[\[\.\.\..+\]\]$/.test(seg)) body += "(?:/.+)?";
    else if (/^\[\.\.\..+\]$/.test(seg)) body += "/.+";
    else if (/^\[.+\]$/.test(seg)) body += "/[^/]+";
    else body += `/${seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  }
  return new RegExp(`^${body || "/"}$`);
}

function collect(dir, urlPath) {
  if (hasRouteFile(dir)) {
    const url = urlPath || "/";
    if (url.includes("[")) dynamicRoutes.push(toRegExp(url));
    else staticRoutes.add(url);
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const name = e.name;
    if (name.startsWith("_") || name.startsWith("@")) continue;
    const next =
      name.startsWith("(") && name.endsWith(")") ? urlPath : `${urlPath}/${name}`;
    collect(path.join(dir, name), next);
  }
}
collect(APP_DIR, "");

// app/sitemap.xml.ts 처럼 파일명이 곧 경로인 라우트
for (const e of readdirSync(APP_DIR, { withFileTypes: true })) {
  if (!e.isFile()) continue;
  const m = /^([a-z0-9.-]+)\.(tsx?|jsx?)$/.exec(e.name);
  if (!m) continue;
  if (["layout", "page", "error", "global-error", "not-found", "template", "loading"].includes(m[1]))
    continue;
  staticRoutes.add(`/${m[1]}`);
}

const { EXACT_REDIRECTS } = await import("../lib/seo/redirect-map.ts");

/* middleware.ts 가 표와 별도로 처리하는 동적 레거시 패턴. 하드코딩이 아니라
   미들웨어 소스에서 실제로 그 분기가 살아 있는지 확인하고 쓴다. */
const middlewareSrc = readFileSync(path.join(ROOT, "middleware.ts"), "utf8");
const MIDDLEWARE_PATTERNS = [];
if (middlewareSrc.includes("/^\\/(?:post|community)\\/([^/]+)$/")) {
  MIDDLEWARE_PATTERNS.push(/^\/(?:post|community)\/[^/]+$/);
}
if (middlewareSrc.includes('path === "/m" || path.startsWith("/m/")')) {
  MIDDLEWARE_PATTERNS.push(/^\/m(?:\/.*)?$/);
}

/** public/ 아래 정적 파일이면 라우트가 아니어도 정상이다. */
function isPublicAsset(p) {
  const rel = p.replace(/^\//, "").split("?")[0];
  if (!rel) return false;
  const full = path.join(ROOT, "public", rel);
  try {
    return existsSync(full) && statSync(full).isFile();
  } catch {
    return false;
  }
}

function isReachable(rawPath) {
  const p = (rawPath.split("#")[0] ?? rawPath).split("?")[0].replace(/\/$/, "") || "/";
  if (staticRoutes.has(p)) return true;
  if (dynamicRoutes.some((re) => re.test(p))) return true;
  if (EXACT_REDIRECTS[p]) return true;
  if (MIDDLEWARE_PATTERNS.some((re) => re.test(p))) return true;
  if (isPublicAsset(p)) return true;
  return false;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "coverage",
  "playwright-report",
  "test-results",
  "public",
  "supabase",
]);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(p);
    } else if (/\.(tsx|ts)$/.test(e.name)) {
      yield p;
    }
  }
}

/* href 리터럴만 뽑는다:
     href="/x"   href={"/x"}   href: "/x"   ctaHref: "/x"   href={`/x/${id}`}
   `${...}` 는 동적 세그먼트 하나로 바꿔서 [id] 라우트와 맞춰 본다. */
const HREF_RE = /\b[A-Za-z]*[Hh]ref\s*[:=]\s*\{?\s*(["'`])(\/[^"'`\n]*)\1/g;

/* `${...}` 를 세그먼트 하나로 치환한다. 중첩 중괄호(삼항 안의 템플릿 리터럴 등)가
   흔해서 `\$\{[^}]*\}` 로는 못 자른다 — 괄호 개수를 세서 짝을 맞춘다. */
function substituteExpressions(raw) {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === "$" && raw[i + 1] === "{") {
      let depth = 1;
      let j = i + 2;
      for (; j < raw.length && depth > 0; j += 1) {
        if (raw[j] === "{") depth += 1;
        else if (raw[j] === "}") depth -= 1;
      }
      out += "__dyn__";
      i = j - 1;
      continue;
    }
    out += raw[i];
  }
  /* `/listings${qs ? `?${qs}` : ""}` 처럼 슬래시 없이 뒤에 붙는 치환은 쿼리스트링
     조립이다(경로 세그먼트가 아니다). 경로 판정에서는 떼어 낸다. */
  return out.replace(/(?<!\/)__dyn__$/, "") || "/";
}

const bad = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(HREF_RE)) {
    const raw = m[2];
    if (raw.startsWith("//")) continue; // 프로토콜 상대 외부 링크
    const normalized = substituteExpressions(raw);
    if (!normalized.startsWith("/")) continue;
    if (isReachable(normalized)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    bad.push(`${path.relative(ROOT, file)}:${line}  ${raw}`);
  }
}

if (bad.length) {
  console.error("[check-route-links] 실존하지 않는 경로를 가리키는 href:");
  for (const b of [...new Set(bad)]) console.error("  " + b);
  console.error(
    "\n이 링크들은 404 로 갑니다. 경로를 실존 라우트로 고치거나, 옛 URL 을 살려야 " +
      "한다면 lib/seo/redirect-map.ts 에 규칙을 추가하세요.",
  );
  process.exit(1);
}

console.log(
  `[check-route-links] OK — href 리터럴 전부 도달 가능 ` +
    `(정적 ${staticRoutes.size} · 동적 ${dynamicRoutes.length} · 리다이렉트 ${Object.keys(EXACT_REDIRECTS).length}).`,
);
