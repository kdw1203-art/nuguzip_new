#!/usr/bin/env node
/**
 * G5 안전장치 — 공개 캐시 목록과 실제 빌드 산출물을 대조한다.
 *
 * lib/http/cache-policy.ts 의 PUBLIC_CACHE_RULES 에 올라간 경로는 "빌드 시 prerender 되어
 * 모든 사용자에게 같은 HTML 이 나간다"는 전제로 CDN 공유 캐시를 허용받는다.
 * 그 전제가 깨진 경로(동적 렌더로 바뀐 경로)가 목록에 남아 있으면, 한 사람의 응답이
 * 다른 사람에게 재사용될 수 있다. 그래서 배포 전에 여기서 막는다.
 *
 * 사용: node scripts/check-cache-policy.mjs   (next build 이후 실행)
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = join(root, "lib/http/cache-policy.ts");
const manifestPath = join(root, ".next/prerender-manifest.json");

function fail(msg) {
  console.error(`\n✗ 캐시 정책 검사 실패\n  ${msg}\n`);
  process.exit(1);
}

/* 매니페스트 대조는 빌드 산출물이 있어야 할 수 있다. 하지만 아래 개인화 표식 검사는
   소스만 읽으므로 빌드 전에도 돈다 — 안전 근거를 확인하는 쪽을 빌드 유무에 맡기지 않는다. */
const hasManifest = existsSync(manifestPath);
if (!hasManifest) {
  console.log("· .next/prerender-manifest.json 없음 — prerender 대조는 건너뜁니다(소스 검사는 진행).");
}

const src = readFileSync(policyPath, "utf8");
const block = src.split("/* PUBLIC_CACHE_RULES:start */")[1]?.split("/* PUBLIC_CACHE_RULES:end */")[0];
if (!block) {
  fail("lib/http/cache-policy.ts 에서 PUBLIC_CACHE_RULES 마커를 찾지 못했습니다.");
}

const listed = [...block.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
if (listed.length === 0) fail("PUBLIC_CACHE_RULES 에서 경로를 하나도 읽지 못했습니다.");

const prerendered = hasManifest
  ? new Set(Object.keys(JSON.parse(readFileSync(manifestPath, "utf8")).routes ?? {}))
  : null;

const missing = prerendered ? listed.filter((p) => !prerendered.has(p)) : [];
if (missing.length > 0) {
  fail(
    [
      "아래 경로는 공개 캐시 목록에 있지만 이번 빌드에서 prerender 되지 않았습니다.",
      "동적 렌더가 되었다면 사용자별 응답이 CDN 에 공유될 수 있습니다.",
      "",
      ...missing.map((p) => `    - ${p}`),
      "",
      "해결: 해당 라우트를 다시 정적으로 만들거나, lib/http/cache-policy.ts 목록에서 빼세요.",
    ].join("\n"),
  );
}

// 개인 화면으로 읽히는 경로가 실수로 들어오는 것도 막는다(지금 정적이어도 곧 개인화된다).
const PRIVATE_PREFIXES = ["/my", "/messages", "/notifications", "/points", "/admin", "/api", "/login", "/signup", "/reset-password", "/forgot-password", "/welcome"];
const privateLeaks = listed.filter((p) =>
  PRIVATE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`)),
);
if (privateLeaks.length > 0) {
  fail(
    [
      "개인·관리자 영역 경로가 공개 캐시 목록에 있습니다:",
      ...privateLeaks.map((p) => `    - ${p}`),
    ].join("\n"),
  );
}

/* ── 동적 라우트 패턴 규칙 ────────────────────────────────────────────────
   PUBLIC_CACHE_PATTERN_RULES 는 prerender 되지 않는 라우트를 공유 캐시에 올린다.
   그래서 "빌드 때 prerender 됐다"는 근거를 쓸 수 없고, 대신 더 직접적인 근거를 쓴다 —
   그 라우트의 서버 렌더에 사용자별 상태가 아예 들어가지 않는다는 것.
   여기서는 그 말이 아직 참인지를 소스에서 직접 확인한다. 표식이 하나라도 새로
   들어오면 CI 가 막는다(정확일치 목록을 매니페스트와 대조하는 것과 같은 급의 검사다). */
const patternBlock = src
  .split("/* PUBLIC_CACHE_PATTERNS:start */")[1]
  ?.split("/* PUBLIC_CACHE_PATTERNS:end */")[0];
if (!patternBlock) {
  fail("lib/http/cache-policy.ts 에서 PUBLIC_CACHE_PATTERNS 마커를 찾지 못했습니다.");
}

const patternRoutes = [...patternBlock.matchAll(/route:\s*"([^"]+)"/g)].map((m) => m[1]);
if (patternRoutes.length === 0) {
  fail("PUBLIC_CACHE_PATTERNS 에서 route 를 하나도 읽지 못했습니다.");
}

/** 서버 렌더에 사용자별 상태를 끌어들이는 표식 */
const PERSONALIZATION_MARKERS = [
  "getUser(",
  "getSession(",
  "cookies()",
  "createServerClient",
  "utils/supabase/server",
  "@/lib/supabase/server",
];

const patternProblems = [];
for (const route of patternRoutes) {
  const dir = join(root, "app", route);
  const page = join(dir, "page.tsx");
  if (!existsSync(page)) {
    patternProblems.push(`${route} — app${route}/page.tsx 가 없습니다(라우트가 사라졌거나 오타).`);
    continue;
  }
  if (PRIVATE_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`))) {
    patternProblems.push(`${route} — 개인·관리자 영역 경로입니다.`);
    continue;
  }
  /* page.tsx 와 같은 폴더의 서버 컴포넌트까지 본다. "use client" 파일은 브라우저에서
     도는 코드라 서버 HTML 을 개인화하지 않으므로 제외한다. */
  const siblings = readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f));
  for (const file of siblings) {
    const text = readFileSync(file, "utf8");
    if (/^\s*["']use client["']/m.test(text.slice(0, 200))) continue;
    const hits = PERSONALIZATION_MARKERS.filter((m) => text.includes(m));
    if (hits.length > 0) {
      patternProblems.push(
        `${route} — ${file.slice(root.length + 1)} 에 ${hits.join(", ")} 가 있습니다.`,
      );
    }
  }
}

/* 가려진 형제 라우트 — `[id]` 패턴은 같은 깊이의 **정적** 형제 경로(`/complex/browse`)까지
   함께 잡는다. 그런데 게이트는 목록에 적힌 route 만 열어 보므로, 가려진 쪽은 개인화가
   생겨도 아무도 확인하지 않는 사각지대가 된다. 그래서 "패턴이 덮는 자리에 있는 실제
   페이지는 전부 제 이름으로 목록에 올라와 있어야 한다"를 여기서 강제한다. */
const patternRouteSet = new Set(patternRoutes);
const listedSet = new Set(listed);
for (const route of patternRoutes) {
  const segments = route.split("/").filter(Boolean);
  if (!segments.at(-1)?.startsWith("[")) continue; // 정적 경로는 형제를 가리지 않는다
  const parentSegments = segments.slice(0, -1);
  const parentDir = join(root, "app", ...parentSegments);
  if (!existsSync(parentDir)) continue;
  for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("[") || entry.name.startsWith("(")) continue;
    if (!existsSync(join(parentDir, entry.name, "page.tsx"))) continue;
    const sibling = `/${[...parentSegments, entry.name].join("/")}`;
    if (patternRouteSet.has(sibling) || listedSet.has(sibling)) continue;
    patternProblems.push(
      `${sibling} — ${route} 패턴에 가려진 실제 페이지인데 목록에 제 이름으로 없습니다.`,
    );
  }
}

if (patternProblems.length > 0) {
  fail(
    [
      "동적 공개 캐시 규칙(PUBLIC_CACHE_PATTERN_RULES)의 전제가 확인되지 않습니다.",
      "이대로 두면 한 사람의 응답이 CDN 을 통해 다른 사람에게 재사용될 수 있습니다.",
      "",
      ...patternProblems.map((p) => `    - ${p}`),
      "",
      "해결: 개인화가 생겼다면 클라이언트로 옮기거나 그 라우트를 목록에서 빼세요.",
      "      패턴에 가려진 페이지라면 lib/http/cache-policy.ts 의 목록에 제 이름으로",
      "      올려(더 앞자리에) 검사 대상에 넣으세요.",
    ].join("\n"),
  );
}

console.log(
  `✓ 캐시 정책 검사 통과 — 정확일치 ${listed.length}건 ` +
    `${prerendered ? "prerender 확인" : "(prerender 대조 생략)"} · ` +
    `동적 패턴 ${patternRoutes.length}건 개인화 표식 0`,
);
