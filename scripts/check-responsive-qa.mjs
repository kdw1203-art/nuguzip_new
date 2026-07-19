#!/usr/bin/env node
/**
 * 반응형·QA 테스트 체크리스트 — 코드/설정 자동 점검
 * 사용: node scripts/check-responsive-qa.mjs
 * 수동: 360/390/768/1024/1280/1440 DevTools + 아래 표 참고
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const results = [];

function pass(area, item, detail = "") {
  results.push({ area, item, status: "PASS", detail });
}

function warn(area, item, detail = "") {
  results.push({ area, item, status: "WARN", detail });
}

function fail(area, item, detail = "") {
  results.push({ area, item, status: "FAIL", detail });
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ── 레이아웃 ─────────────────────────────────────────────
const globals = read("app/globals.css");
if (globals.includes("--wd-screen-tablet-min: 768px") && globals.includes("--wd-screen-desktop-min: 1280px")) {
  pass("레이아웃", "브레이크포인트 768/1280", "globals.css 토큰");
} else {
  fail("레이아웃", "브레이크포인트 768/1280");
}
if (globals.includes(".category-grid--workbench") && globals.includes("320px minmax(0, 1fr) 360px")) {
  pass("레이아웃", "데스크톱 3단 workbench grid", "1280px+");
} else {
  warn("레이아웃", "데스크톱 3단 workbench grid");
}
if (exists("lib/design/use-breakpoint.ts") && exists("lib/design/breakpoints.ts")) {
  pass("레이아웃", "useBreakpoint 훅", "360~1440 수동 DevTools 권장");
} else {
  fail("레이아웃", "useBreakpoint 훅");
}

// ── 내비게이션 ───────────────────────────────────────────
const header = read("components/site-header.tsx");
const tabBlock = header.match(/MOBILE_BOTTOM_TABS[\s\S]*?];/);
if (tabBlock) {
  const labels = [...tabBlock[0].matchAll(/shortLabel:\s*"([^"]+)"/g)].map((m) => m[1]);
  const expected = ["홈", "지도", "임장", "AI", "마이"];
  if (JSON.stringify(labels) === JSON.stringify(expected)) {
    pass("내비게이션", "하단 5탭 IA", labels.join(" · "));
  } else {
    fail("내비게이션", "하단 5탭 IA", `got: ${labels.join(", ")}`);
  }
}
if (!header.includes('shortLabel: "동네"') && !header.includes('label: "커뮤니티"')) {
  pass("내비게이션", "커뮤니티 탭 미포함", "AGENTS.md 준수");
} else {
  fail("내비게이션", "커뮤니티 탭 미포함");
}

// ── 폼 입력 (터치 타깃) ──────────────────────────────────
const touchPatterns = [
  ["components/inspection/field-capture-first-panel.tsx", "임장 체크·사진·음성"],
  ["components/inspection/address-field-with-suggestions.tsx", "주소 검색"],
  ["components/ui/multi-image-uploader.tsx", "이미지 업로드"],
];
for (const [file, label] of touchPatterns) {
  if (!exists(file)) {
    warn("폼 입력", label, `${file} 없음`);
    continue;
  }
  const src = read(file);
  if (/min-h-\[(44|48)px\]|min-h-10|min-h-11|min-h-12|WORKFLOW_VISUAL\.primaryBtn/.test(src)) {
    pass("폼 입력", label, "min-height 터치 패턴");
  } else {
    warn("폼 입력", label, "min-h 터치 패턴 확인 필요 — 수동 QA");
  }
}

// ── 성능 (홈 로딩) ───────────────────────────────────────
const landing = read("components/native-landing.tsx");
if (landing.includes("loadHomeData") && landing.includes("MobileHomeSimple")) {
  pass("성능", "홈 SSR 데이터", "NativeLanding + loadHomeData");
} else {
  warn("성능", "홈 SSR 데이터");
}
const rootLoading = exists("app/loading.tsx") ? read("app/loading.tsx") : "";
if (rootLoading.includes("FeedSkeleton") || rootLoading.includes("PageLoadingShell")) {
  pass("성능", "루트 loading skeleton", "텍스트-only 아님");
} else {
  warn("성능", "루트 loading skeleton", "수동: 홈 첫 paint 확인");
}

// ── 접근성 ───────────────────────────────────────────────
if (read("app/layout.tsx").includes('href="#main-content"')) {
  pass("접근성", "본문 skip link");
} else {
  fail("접근성", "본문 skip link");
}
if (read("components/ui/feed-state.tsx").includes('aria-live="polite"')) {
  pass("접근성", "로딩 aria-live", "PageLoadingShell");
} else {
  warn("접근성", "로딩 aria-live");
}

// ── SEO ──────────────────────────────────────────────────
const hubs = [
  ["app/ai-analysis/page.tsx", "AI"],
  ["app/community/page.tsx", "동네"],
  ["app/explore/page.tsx", "지도"],
  ["app/inspection/hub/page.tsx", "임장"],
];
for (const [file, name] of hubs) {
  if (!exists(file)) continue;
  const src = read(file);
  if (src.includes("buildPageMetadata") || src.includes("CATEGORY_HUB_COPY") || src.includes("buildRegionMetadata")) {
    pass("SEO", `${name} hub metadata`);
  } else {
    warn("SEO", `${name} hub metadata`);
  }
}
if (read("lib/seo/page-metadata.ts").includes("alternates: { canonical")) {
  pass("SEO", "buildPageMetadata canonical");
} else {
  fail("SEO", "buildPageMetadata canonical");
}
const mw = read("middleware.ts");
if (mw.includes("308") && /m\.nuguzip|subdomain.*redirect/i.test(mw)) {
  pass("SEO", "m 서브도메인 canonical redirect");
} else {
  warn("SEO", "m 서브도메인 redirect", "middleware 확인");
}

// ── 상태 관리 ────────────────────────────────────────────
if (exists("lib/inspection/compare-tray-store.ts") && read("lib/inspection/compare-tray-store.ts").includes("localStorage")) {
  pass("상태 관리", "비교함 localStorage", "뷰포트 전환 후 유지 — 수동 확인");
} else {
  warn("상태 관리", "비교함 localStorage");
}
if (exists("components/bookmark-toggle.tsx")) {
  pass("상태 관리", "북마크 UI", "API/local — 수동 확인");
} else {
  warn("상태 관리", "북마크 UI");
}

// ── 지도 ─────────────────────────────────────────────────
const naverMap = read("components/map/NaverMap.tsx");
if (naverMap.includes("OpenStreetMap") && naverMap.includes("대체 지도")) {
  pass("지도", "OSM fallback", "NaverMap.tsx");
} else {
  fail("지도", "OSM fallback");
}
if (read("components/region/region-explorer-client.tsx").includes('mobileView === "list"')) {
  pass("지도", "모바일 목록 fallback", "map/list 탭");
} else {
  warn("지도", "모바일 목록 fallback");
}

// ── 결제 ─────────────────────────────────────────────────
if (exists("components/pricing/mobile-iap-notice.tsx")) {
  pass("결제", "IAP vs 웹 PG 분기 안내", "mobile-iap-notice.tsx");
} else {
  warn("결제", "IAP vs 웹 PG 분기");
}
if (read("app/pricing/page.tsx").includes("PricingCheckoutButtons")) {
  pass("결제", "웹 checkout CTA", "pricing page");
} else {
  warn("결제", "웹 checkout CTA");
}

// ── 추적 ─────────────────────────────────────────────────
const viewportCtx = exists("lib/analytics/viewport-context.ts") ? read("lib/analytics/viewport-context.ts") : "";
if (viewportCtx.includes("device_type") && viewportCtx.includes("viewport_group") && viewportCtx.includes("entry_route")) {
  pass("추적", "viewport metadata", "lib/analytics/viewport-context.ts");
} else {
  fail("추적", "viewport metadata");
}
const pv = read("components/platform-pageview-tracker.tsx");
if (pv.includes("withViewportMetadata") && pv.includes("viewport_group_change")) {
  pass("추적", "page_view + viewport_group_change");
} else {
  fail("추적", "page_view + viewport_group_change");
}

// ── 출력 ─────────────────────────────────────────────────
console.log("\n=== 반응형 QA 체크리스트 (자동) ===\n");
console.log("| 영역 | 항목 | 상태 | 비고 |");
console.log("|------|------|------|------|");
for (const r of results) {
  const note = r.detail ? r.detail.replace(/\|/g, "\\|") : "";
  console.log(`| ${r.area} | ${r.item} | ${r.status} | ${note} |`);
}

const fails = results.filter((r) => r.status === "FAIL").length;
const warns = results.filter((r) => r.status === "WARN").length;
console.log(`\nPASS ${results.filter((r) => r.status === "PASS").length} · WARN ${warns} · FAIL ${fails}\n`);

console.log("수동 DevTools 해상도: 360 · 390 · 768 · 1024 · 1280 · 1440");
console.log("수동 확인: 북마크/비교 뷰포트 전환, 키보드 Tab 포커스, 결제 실제 플로우\n");

process.exit(fails > 0 ? 1 : 0);
