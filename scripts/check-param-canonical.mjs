#!/usr/bin/env node
/**
 * N7 — 쿼리 파라미터 정규화(canonical) 감사.
 *
 * 문제의 모양: 목록 페이지는 `?type=jeonse`, `?district=강남구`, `?sort=recent`
 * 처럼 파라미터로 같은 표를 다르게 잘라 보여 준다. 사람에게는 한 페이지지만,
 * canonical 이 없으면 크롤러에게는 **조합 수만큼의 서로 다른 URL** 이다.
 * 셋만 곱해도 수백 개고, 내용은 거의 같다. 그러면 색인 신호가 그 수백 개로
 * 쪼개져 원래 페이지가 밀리고, 심하면 중복으로 걸러진다.
 *
 * 막는 방법은 둘 중 하나뿐이다.
 *   1) canonical 을 파라미터 없는 경로로 고정한다(대부분의 목록 페이지).
 *   2) 아예 색인하지 않는다(비교함·작성 폼처럼 URL 자체가 일회용인 화면).
 * 이 스크립트는 searchParams 를 읽는 페이지가 둘 중 **아무것도** 하지 않은 채
 * 배포되는 것을 막는다.
 *
 * 왜 소스를 보는가: 이 페이지들은 대부분 force-dynamic 이라 빌드 산출물에
 * HTML 이 없다. 검사할 대상이 소스밖에 없다.
 *
 * 덤으로 canonical 경로 오타도 잡는다. seoAlternates("/auctions") 를
 * app/supply/page.tsx 에 복사해 두면 두 페이지가 한 URL 을 가리키게 되는데,
 * 이건 canonical 이 없는 것보다 나쁘다 — 멀쩡한 페이지가 스스로 색인에서
 * 빠지겠다고 선언하는 꼴이다.
 *
 * 사용: node scripts/check-param-canonical.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "app");

if (!existsSync(appDir)) {
  console.error("app 디렉터리를 찾을 수 없습니다.");
  process.exit(1);
}

/** API 라우트는 HTML 문서가 아니라 색인 대상이 아니다 — robots.txt 에서도 막는다. */
const SKIP_SEGMENTS = new Set(["api"]);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (SKIP_SEGMENTS.has(name)) continue;
      walk(p, out);
    } else if (name === "page.tsx" || name === "page.ts") {
      out.push(p);
    }
  }
  return out;
}

/** app/town/groups/page.tsx → /town/groups  (라우트 그룹 (x) 은 경로에서 빠진다) */
function routePathOf(file) {
  const rel = relative(appDir, file).split(sep).slice(0, -1);
  const segs = rel.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return segs.length === 0 ? "/" : `/${segs.join("/")}`;
}

const isDynamicRoute = (routePath) => routePath.includes("[");

const problems = [];
const files = walk(appDir, []);
let audited = 0;
let viaCanonical = 0;
let viaNoIndex = 0;

/**
 * `"use client"` 페이지는 metadata 를 내보낼 수 없다 — Next.js 규칙이다.
 * 그런 페이지의 canonical 은 같은 폴더의 layout.tsx 가 대신 선언하며, 그렇게
 * 붙은 canonical 도 실제로 HTML 에 들어간다. 그러니 page.tsx 만 읽고 없다고
 * 판정하면 멀쩡히 처리된 페이지를 오탐으로 잡는다 — 형제 layout 도 함께 본다.
 */
function siblingLayoutSource(file) {
  for (const name of ["layout.tsx", "layout.ts"]) {
    const p = join(dirname(file), name);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return "";
}

for (const file of files) {
  const pageSrc = readFileSync(file, "utf8");

  // searchParams 를 읽지 않으면 파라미터 중복 색인 위험 자체가 없다.
  if (!/\bsearchParams\b/.test(pageSrc)) continue;

  const src = pageSrc + "\n" + siblingLayoutSource(file);

  const routePath = routePathOf(file);
  const rel = relative(root, file);
  audited += 1;

  const hasNoIndex = /index:\s*false/.test(src);
  const hasIndexTrue = /index:\s*true/.test(src);

  // canonical 을 만들어 내는 세 가지 경로.
  const usesSeoAlternates = /\bseoAlternates\s*\(/.test(src);
  const usesRequestAlternates = /\bbuildAlternatesForRequest\s*\(/.test(src);
  const buildPageMetaCalls = [...src.matchAll(/buildPageMetadata\s*\(\s*\{/g)];

  // buildPageMetadata 는 path 를 넘겨야만 canonical 이 붙는다 — 빠뜨리기 쉬운 자리다.
  let buildPageMetaHasPath = false;
  for (const m of buildPageMetaCalls) {
    const window = src.slice(m.index, m.index + 800);
    if (/\bpath:\s*[`"']/.test(window)) buildPageMetaHasPath = true;
    else {
      problems.push(
        `${rel}: buildPageMetadata 에 path 가 없습니다 — path 를 넘기지 않으면 canonical 이 아예 붙지 않습니다 (${routePath})`,
      );
    }
  }

  const hasCanonical = usesSeoAlternates || usesRequestAlternates || buildPageMetaHasPath;

  if (hasCanonical) {
    viaCanonical += 1;
  } else if (hasNoIndex && !hasIndexTrue) {
    viaNoIndex += 1;
  } else {
    problems.push(
      `${rel}: searchParams 를 읽는데 canonical 도 noindex 도 없습니다 — ` +
        `\`alternates: seoAlternates("${routePath}")\` 를 붙이거나, 일회용 URL 이면 ` +
        `\`robots: { index: false, follow: true }\` 로 색인에서 빼세요`,
    );
  }

  // canonical 경로가 실제 라우트와 같은지 — 정적 라우트에 한해 문자열을 대조한다.
  if (!isDynamicRoute(routePath)) {
    for (const m of src.matchAll(/seoAlternates\s*\(\s*"([^"]+)"\s*\)/g)) {
      if (m[1] !== routePath) {
        problems.push(
          `${rel}: canonical 이 "${m[1]}" 를 가리키는데 이 파일의 라우트는 "${routePath}" 입니다 — 복사 실수로 남의 URL 을 가리키면 이 페이지가 색인에서 빠집니다`,
        );
      }
    }
    for (const m of src.matchAll(/buildPageMetadata\s*\(\s*\{[\s\S]{0,800}?path:\s*"([^"]+)"/g)) {
      if (m[1] !== routePath) {
        problems.push(
          `${rel}: canonical 이 "${m[1]}" 를 가리키는데 이 파일의 라우트는 "${routePath}" 입니다`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error("\n✗ 파라미터 canonical 감사 실패\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\n  파라미터 조합마다 별개 URL 로 색인되면 원래 페이지의 색인 신호가 그만큼 쪼개집니다.\n",
  );
  process.exit(1);
}

console.log(
  `✓ 파라미터 canonical 감사 통과 — searchParams 사용 페이지 ${audited}개 ` +
    `(canonical 고정 ${viaCanonical} · 색인 제외 ${viaNoIndex})`,
);
