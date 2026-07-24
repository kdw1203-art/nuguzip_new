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
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = join(root, "lib/http/cache-policy.ts");
const manifestPath = join(root, ".next/prerender-manifest.json");

function fail(msg) {
  console.error(`\n✗ 캐시 정책 검사 실패\n  ${msg}\n`);
  process.exit(1);
}

if (!existsSync(manifestPath)) {
  console.log("· .next/prerender-manifest.json 없음 — 빌드 전이므로 검사를 건너뜁니다.");
  process.exit(0);
}

const src = readFileSync(policyPath, "utf8");
const block = src.split("/* PUBLIC_CACHE_RULES:start */")[1]?.split("/* PUBLIC_CACHE_RULES:end */")[0];
if (!block) {
  fail("lib/http/cache-policy.ts 에서 PUBLIC_CACHE_RULES 마커를 찾지 못했습니다.");
}

const listed = [...block.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
if (listed.length === 0) fail("PUBLIC_CACHE_RULES 에서 경로를 하나도 읽지 못했습니다.");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const prerendered = new Set(Object.keys(manifest.routes ?? {}));

const missing = listed.filter((p) => !prerendered.has(p));
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

console.log(`✓ 캐시 정책 검사 통과 — 공개 캐시 대상 ${listed.length}건 모두 prerender 확인`);
