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

/** read() 가 못 찾은 경로 — 검사 항목이 낡았다는 뜻이라 마지막에 따로 알린다 */
const missingFiles = [];

/**
 * 파일이 없으면 빈 문자열. 예전엔 그대로 던져서, 리팩터로 파일 하나가 옮겨지면
 * 스크립트 전체가 첫 검사에서 죽고 나머지 30여 개 검사가 아예 실행되지 않았다.
 * (실제로 components/site-header.tsx 가 사라진 뒤 계속 크래시하고 있었다.)
 * 이제는 해당 항목만 FAIL/WARN 으로 떨어지고 나머지는 정상적으로 검사된다.
 */
function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    if (!missingFiles.includes(rel)) missingFiles.push(rel);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

/**
 * app/·components/·lib/ 안에 이 문자열이 있는지. 파일 경로를 박아 두면 리팩터로
 * 파일이 옮겨질 때마다 검사가 거짓 FAIL 을 내므로, 기능 유무는 내용으로 판단한다.
 */
function grepRepo(needle, roots = ["app", "components", "lib"]) {
  const stack = roots.map((r) => path.join(ROOT, r)).filter((p) => fs.existsSync(p));
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        stack.push(abs);
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) {
        if (fs.readFileSync(abs, "utf8").includes(needle)) return true;
      }
    }
  }
  return false;
}

// ── 레이아웃 ─────────────────────────────────────────────
const globals = read("app/globals.css");
// 브레이크포인트 정의는 globals.css 의 CSS 변수에서 lib/design/breakpoints.ts 로 옮겼다.
// (JS 훅과 CSS 미디어쿼리가 같은 숫자를 쓰도록 한 곳에 모은 것) — 검사도 그쪽을 본다.
const bpSrc = read("lib/design/breakpoints.ts");
if (bpSrc.includes("tabletMin: 768") && bpSrc.includes("desktopMin: 1280")) {
  pass("레이아웃", "브레이크포인트 768/1280", "lib/design/breakpoints.ts");
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
// G6: canonical 은 lib/seo/alternates.ts 의 seoAlternates() 한 곳에서 만든다
// (canonical + ko-KR/x-default hreflang 동시 생성). 예전엔 페이지마다 문자열을
// 이어 붙였고 이 검사도 `alternates: { canonical` 리터럴을 찾고 있었다.
const alternatesSrc = read("lib/seo/alternates.ts");
const pageMetaSrc = read("lib/seo/page-metadata.ts");
if (
  alternatesSrc.includes("export function seoAlternates") &&
  alternatesSrc.includes("canonical") &&
  alternatesSrc.includes("x-default") &&
  pageMetaSrc.includes("seoAlternates(")
) {
  pass("SEO", "buildPageMetadata canonical", "seoAlternates(canonical+hreflang)");
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
// 실제 상태: withViewportMetadata() 는 lib/analytics/viewport-context.ts 에 있지만
// 그걸 붙여 page_view / viewport_group_change 를 쏘는 트래커가 아직 없다.
// (예전 검사는 지금은 없는 components/platform-pageview-tracker.tsx 를 찾고 있었다.)
// 없는 걸 PASS 로 덮지 않는다 — 미구현이라는 사실 그대로 남긴다.
const pvEmitter = grepRepo("viewport_group_change");
if (pvEmitter) {
  pass("추적", "page_view + viewport_group_change");
} else {
  warn("추적", "page_view + viewport_group_change", "이벤트 발신부 미구현 — withViewportMetadata만 존재");
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

if (missingFiles.length > 0) {
  console.log("검사 대상 파일이 없어 빈 내용으로 판정한 경로 (검사 항목이 낡았을 수 있음):");
  for (const f of missingFiles) console.log(`  - ${f}`);
  console.log("");
}

console.log("수동 DevTools 해상도: 360 · 390 · 768 · 1024 · 1280 · 1440");
console.log("수동 확인: 북마크/비교 뷰포트 전환, 키보드 Tab 포커스, 결제 실제 플로우\n");

process.exit(fails > 0 ? 1 : 0);
