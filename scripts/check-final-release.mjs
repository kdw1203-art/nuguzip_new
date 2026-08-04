#!/usr/bin/env node
/**
 * 최종 릴리스 자동 점검 — 보안·SEO·정책·코드 패턴
 * 사용: npm run check:final-release
 * 수동 QA: docs/final-test-checklist.md
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
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

/**
 * 파일이 없으면 빈 문자열을 준다.
 *
 * 예전에는 readFileSync 가 그대로 throw 해서, 점검 항목 하나가 가리키는 파일이
 * 사라지면 릴리스 점검 **전체**가 ENOENT 로 죽었다(실제로 죽어 있었다:
 * components/inspection/field-capture-consent.tsx). 한 항목의 부재가 나머지
 * 수십 개 항목의 결과를 통째로 가리는 건 점검 도구로서 잘못된 실패 방식이다.
 * 이제는 그 항목만 조용히 미충족(WARN/FAIL)으로 떨어지고 나머지는 계속 돈다.
 */
function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function walkDir(dir, acc = []) {
  if (!exists(dir)) return acc;
  for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, ent.name).replace(/\\/g, "/");
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    if (ent.isDirectory()) walkDir(rel, acc);
    else if (/\.(tsx?|jsx?|mjs)$/.test(ent.name)) acc.push(rel);
  }
  return acc;
}

// ── 보안 ───────────────────────────────────────────────
const secretPatterns = [
  { re: /sk_live_[a-zA-Z0-9]{10,}/, label: "Stripe live secret" },
  { re: /sk_test_[a-zA-Z0-9]{10,}/, label: "Stripe test secret in source" },
  { re: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/, label: "hardcoded service role" },
];
const sourceFiles = walkDir(".");
let secretHits = 0;
for (const file of sourceFiles) {
  if (file.includes(".env")) continue;
  const src = read(file);
  for (const { re, label } of secretPatterns) {
    if (re.test(src)) {
      secretHits++;
      fail("보안", "Secrets in source", `${file}: ${label}`);
    }
  }
}
if (secretHits === 0) pass("보안", "No obvious secrets in TS/JS");

if (read("auth.ts").includes("kdw1203@gmail.com")) {
  warn("보안", "Hardcoded admin email in auth.ts");
} else if (read("lib/auth/staff-roles.ts").includes("kdw1203@gmail.com")) {
  warn("보안", "Hardcoded admin email in staff-roles.ts");
} else {
  pass("보안", "No hardcoded admin email");
}

if (read("auth.ts").includes('TEST_ACCOUNT_ENABLED?.trim() === "1"')) {
  pass("보안", "Test account opt-in only");
} else {
  warn("보안", "Test account gate");
}

if (read("app/api/upload/route.ts").includes("applyRateLimit")) {
  pass("보안", "Upload rate limit");
} else {
  fail("보안", "Upload rate limit");
}
if (read("middleware.ts").includes("rate") || read("lib/rate-limit.ts")) {
  pass("보안", "Rate limit module present");
} else {
  warn("보안", "Rate limit module");
}

// ── 개인정보 ───────────────────────────────────────────
if (exists("components/consent/cookie-consent-banner.tsx") || exists("components/ga4-gtag-loader.tsx")) {
  const ga4 = read("components/ga4-gtag-loader.tsx");
  if (ga4.includes("useCookieConsent")) {
    pass("개인정보", "GA4 consent-gated");
  } else {
    warn("개인정보", "GA4 consent gate");
  }
} else {
  warn("개인정보", "Cookie consent / GA4 loader");
}
if (read("app/legal/privacy/page.tsx").includes("OpenAI") || read("app/legal/privacy/page.tsx").includes("국외")) {
  pass("개인정보", "Privacy: AI/국외이전 mention");
} else {
  warn("개인정보", "Privacy: AI/국외이전");
}
if (exists("app/legal/expert/page.tsx")) {
  pass("개인정보", "Expert operating policy page");
} else {
  fail("개인정보", "Expert operating policy page");
}
if (read("components/inspection/field-capture-consent.tsx").includes("AI API 전송")) {
  pass("개인정보", "Field capture AI consent");
} else {
  warn("개인정보", "Field capture AI consent");
}

// ── SEO ────────────────────────────────────────────────
if (read("lib/seo/page-metadata.ts").includes("openGraph")) {
  pass("SEO", "buildPageMetadata openGraph");
} else {
  fail("SEO", "buildPageMetadata openGraph");
}
if (exists("app/og-image/route.tsx") || exists("app/og-image/page.tsx")) {
  pass("SEO", "og-image route");
} else {
  warn("SEO", "og-image route");
}
// S1 — 사이트맵 정적 목록 ↔ 실제 라우트 대조.
// STATIC_ROUTES 에 있는데 app/ 에 페이지가 없으면 사이트맵이 404 를 광고하는 것이다.
{
  const sitemapSrc = read("lib/seo/build-sitemap.ts");
  const staticBlock = sitemapSrc.split("STATIC_ROUTES")[1]?.split("];")[0] ?? "";
  const paths = [...staticBlock.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
  const missing = paths.filter((p) => {
    if (p === "/") return !exists("app/page.tsx");
    const seg = p.replace(/^\//, "");
    return !exists(`app/${seg}/page.tsx`) && !exists(`app/${seg}/route.ts`) && !exists(`app/${seg}/route.tsx`);
  });
  if (paths.length === 0) {
    warn("SEO", "Sitemap static routes parse");
  } else if (missing.length > 0) {
    fail("SEO", "Sitemap static routes exist", `없는 라우트: ${missing.join(", ")}`);
  } else {
    pass("SEO", "Sitemap static routes exist", `${paths.length}개 확인`);
  }
}
// G2 — llms.txt / G16 — 전역 JSON-LD
// 항목 44: 정적 public/llms.txt → 라우트(app/llms.txt/route.ts) 전환.
// 실커버리지(지역·단지 수)를 실데이터에서 찍기 위해서다. 라우트가 있으면 통과,
// 라우트도 정적 파일도 없으면 경고.
if (exists("app/llms.txt/route.ts") || exists("public/llms.txt")) {
  pass("SEO", "llms.txt (GEO)");
} else {
  warn("SEO", "llms.txt (GEO)");
}
if (read("app/layout.tsx").includes("SiteJsonLd")) {
  pass("SEO", "Organization/WebSite JSON-LD");
} else {
  warn("SEO", "Organization/WebSite JSON-LD");
}
for (const f of ["app/robots.ts", "app/robots.txt", "public/robots.txt"]) {
  if (exists(f)) {
    pass("SEO", "robots", f);
    break;
  }
}
if (exists("app/sitemap.ts") || exists("app/sitemap.xml")) {
  pass("SEO", "sitemap");
} else {
  warn("SEO", "sitemap");
}

// ── 카피 / 사업자 ──────────────────────────────────────
const biz = read("lib/brand/business-info.ts");
if (biz.includes('serviceName: "우리동네이야기"')) {
  pass("카피", "Service name 우리동네이야기");
} else {
  warn("카피", "Service name");
}
if (biz.includes("isBusinessDisclosureComplete")) {
  pass("카피", "Business disclosure helper");
  warn("카피", "COMPANY_* env on prod", "수동: 푸터·pricing 사업자 4필드");
} else {
  fail("카피", "Business disclosure");
}

// ── 결제 ───────────────────────────────────────────────
if (exists("app/api/billing/webhook/route.ts") && read("app/api/billing/webhook/route.ts").includes("checkout.session.completed")) {
  pass("결제", "Stripe webhook handlers");
} else {
  warn("결제", "Stripe webhook");
}
if (exists("app/api/payments/kakaopay/ready/route.ts")) {
  pass("결제", "KakaoPay ready route");
} else {
  warn("결제", "KakaoPay");
}

// ── 전문가 ─────────────────────────────────────────────
if (exists("lib/experts/verification-policy.ts") && exists("app/api/experts/register/route.ts")) {
  pass("전문가", "Verification policy + register API");
} else {
  fail("전문가", "Verification workflow");
}
if (read("lib/experts/fraud-guards.ts").includes("scanExpertConversationText")) {
  pass("전문가", "Conversation fraud scan");
} else {
  warn("전문가", "Fraud guards");
}

// ── 업로드 ─────────────────────────────────────────────
const uploadLib = read("lib/storage/upload.ts");
if (uploadLib.includes("ALLOWED_MIME_TYPES") && uploadLib.includes("UPLOAD_MAX_BYTES")) {
  pass("업로드", "MIME + size limits");
} else {
  fail("업로드", "Upload limits");
}
if (/sharp|exif|stripMetadata/i.test(uploadLib + read("app/api/upload/route.ts"))) {
  pass("업로드", "EXIF/strip or sharp");
} else {
  warn("업로드", "EXIF removal not implemented", "final-test-checklist U-P5");
}

// ── 접근성 ─────────────────────────────────────────────
if (read("app/layout.tsx").includes("#main-content")) {
  pass("접근성", "Skip link");
} else {
  fail("접근성", "Skip link");
}

// ── 접근성/체감 — 무거운 동적 라우트 스켈레톤 회귀 게이트 (고도화 42) ──
// 이 4개 라우트는 DB 곁다리 조회 예산(최대 8초) 동안 loading.tsx 가 없으면
// 흰 화면이 된다. 한 번 지워지면 아무 테스트도 안 깨지는 종류의 회귀라 여기서 잡는다.
{
  const heavyRoutes = [
    "app/complex/[id]/loading.tsx",
    "app/region/[id]/loading.tsx",
    "app/map/loading.tsx",
    "app/tx/[region]/loading.tsx",
  ];
  const missing = heavyRoutes.filter((p) => !exists(p));
  if (missing.length === 0) {
    pass("접근성", "Heavy-route skeletons (loading.tsx)", `${heavyRoutes.length}개 확인`);
  } else {
    fail("접근성", "Heavy-route skeletons (loading.tsx)", `누락: ${missing.join(", ")}`);
  }
}

// ── 결제 — 토스 전 구간 배선 게이트 (2026-08-03) ──────────────
// 결제는 "한 조각만 빠져도 전부 안 되는" 체인이다. 파일 존재+핵심 계약만 본다.
{
  const tossChain = [
    ["app/subscription/checkout/CheckoutClient.tsx", "위젯 체크아웃"],
    ["app/api/payments/toss/create/route.ts", "주문 생성"],
    ["app/api/payments/toss/confirm/route.ts", "승인(confirm)"],
    ["app/api/payments/toss/webhook/route.ts", "웹훅 수신"],
    ["app/api/admin/payments/cancel/route.ts", "관리자 취소(청약철회)"],
    ["app/payment/success/page.tsx", "성공 랜딩"],
    ["app/payment/fail/page.tsx", "실패 랜딩"],
  ];
  const missing = tossChain.filter(([p]) => !exists(p)).map(([, label]) => label);
  const csp = read("lib/security/content-security-policy.ts");
  if (!csp.includes("js.tosspayments.com")) missing.push("CSP(js.tosspayments.com)");
  const confirm = read("app/api/payments/toss/confirm/route.ts");
  if (!confirm.includes("Idempotency-Key")) missing.push("confirm 멱등키");
  if (!confirm.includes("existing.amount")) missing.push("confirm 금액 대조");
  if (missing.length === 0) {
    pass("결제", "Toss chain complete", `${tossChain.length}개 경로 + CSP + 멱등·금액검증`);
  } else {
    fail("결제", "Toss chain complete", `누락: ${missing.join(", ")}`);
  }
}

// ── 운영 ───────────────────────────────────────────────
if (exists("lib/admin/operating-metrics.ts")) {
  pass("운영", "Operating metrics loader");
} else {
  warn("운영", "Operating metrics");
}
if (exists("app/api/health/route.ts")) {
  pass("운영", "GET /api/health");
} else {
  warn("운영", "Health route");
}

// ── 하위 게이트 ────────────────────────────────────────
/**
 * N7·N8 — 별도 스크립트로 도는 게이트를 여기서 한 번에 같이 돌린다.
 *
 * 따로 두면 결국 아무도 안 돌린다. 릴리스 점검이 한 명령이어야 실제로 돌아간다.
 *
 * check-jsonld 는 빌드 산출물이 있어야 의미가 있는데, 없으면 스스로 exit 0 으로
 * 건너뛴다(그 경우 여기서도 WARN 으로 남겨 "검사했다"고 오해하지 않게 한다).
 */
function runGate(area, item, script, { needsBuild = false, skipRe = null } = {}) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", script)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.status === 0) {
    if (needsBuild && /건너뜁니다/.test(out)) {
      warn(area, item, "빌드 산출물이 없어 검사하지 못함 — next build 후 재실행");
      return;
    }
    // exit 0 이지만 실제로는 확인하지 못한 경우(접속 불가 등) — PASS 로 세면
    // "확인 못 함" 이 "이상 없음" 으로 둔갑한다. 이번 장애가 정확히 그 모양이었다.
    if (skipRe && skipRe.test(out)) {
      warn(area, item, out.split("\n")[0]?.slice(0, 160) ?? "확인하지 못함");
      return;
    }
    pass(area, item, out.split("\n")[0]?.replace(/^✓\s*/, "") ?? "");
  } else {
    const first = out.split("\n").find((l) => l.trim().startsWith("-")) ?? out.split("\n")[0] ?? "";
    fail(area, item, first.trim().slice(0, 160));
  }
}

runGate("SEO", "사이트맵 인덱스 배선 (N4)", "check-sitemap-index.mjs");
runGate("SEO", "리다이렉트 맵 검증 (N6)", "check-redirect-map.mjs");
runGate("SEO", "파라미터 canonical 감사 (N7)", "check-param-canonical.mjs");
runGate("SEO", "구조화 데이터 검증 (N8)", "check-jsonld.mjs", { needsBuild: true });
// DROP 이 GRANT 를 지우는 함정 — 2026-07-25 /tx 장애의 정적/실측 재발 방지 게이트
runGate("데이터", "마이그레이션 GRANT 린트", "check-migration-grants.mjs");
runGate("데이터", "public.*_source 뷰 실조회 권한", "check-source-views.mjs", {
  skipRe: /\bSKIP\b/,
});
/* 카탈로그의 envKey 가 실제 process.env 참조와 어긋나면 상태 배지와 소유자
   안내 문서가 동시에 거짓이 된다 — 2026-07-28 에 세 개가 그랬다. */
runGate("데이터", "envKey 이름 ↔ 실제 참조 일치", "check-env-key-names.mjs");

/* ── 모바일28 — 모바일 압축 토큰 ↔ md+ 원복 짝 검사 ──────────────
   2026-08-03 모바일 2차 축소는 :root 토큰(모바일 기본값)을 줄이고
   @media (min-width: 768px) 블록이 데스크톱 값으로 "원복"하는 구조다.
   토큰을 :root 에서 줄여 놓고 md+ 원복을 빠뜨리면 데스크톱까지 조용히
   줄어든다 — 그 누락을 배포 전에 잡는다. 규칙:
   1) 아래 압축 토큰은 :root 와 md+ :root 양쪽에 모두 있어야 하고
   2) 두 값이 같으면 원복이 죽은 코드라는 뜻이므로 그것도 실패다. */
{
  const css = read("app/globals.css");
  const mdBlockMatch = css.match(/@media \(min-width: 768px\)\s*\{\s*:root\s*\{([\s\S]*?)\}/);
  const mdBlock = mdBlockMatch ? mdBlockMatch[1] : "";
  const COMPACT_TOKENS = [
    "--fs-display",
    "--fs-title",
    "--pad-compact",
    "--pad-card",
    "--pad-hero",
    "--radius-card",
    /* 2026-08-04 3차 축소에서 간격 토큰도 압축 대상이 됐다 */
    "--sp-card-gap",
    "--sp-section",
  ];
  const grab = (src, token) => {
    const m = src.match(new RegExp(`${token}:\\s*([^;]+);`));
    return m ? m[1].trim() : null;
  };
  const problems = [];
  if (!mdBlock) {
    problems.push("md+ :root 원복 블록 자체가 없음");
  } else {
    for (const t of COMPACT_TOKENS) {
      const base = grab(css, t); // 첫 등장 = :root (md 블록은 파일 후반)
      const md = grab(mdBlock, t);
      if (!base) problems.push(`${t}: :root 정의 없음`);
      else if (!md) problems.push(`${t}: md+ 원복 누락 — 데스크톱까지 축소됨`);
      else if (base === md) problems.push(`${t}: 모바일·md+ 값 동일(${base}) — 원복이 무의미`);
    }
  }
  if (problems.length === 0) {
    pass("디자인", "모바일 토큰 md+ 원복 짝", `${COMPACT_TOKENS.length}종 확인`);
  } else {
    fail("디자인", "모바일 토큰 md+ 원복 짝", problems.join(" · "));
  }
}

// ── 출력 ───────────────────────────────────────────────
console.log("\n=== 최종 릴리스 자동 점검 ===\n");
console.log("| 도메인 | 항목 | 상태 | 비고 |");
console.log("|--------|------|------|------|");
for (const r of results) {
  const note = (r.detail || "").replace(/\|/g, "\\|");
  console.log(`| ${r.area} | ${r.item} | ${r.status} | ${note} |`);
}
const fails = results.filter((r) => r.status === "FAIL").length;
const warns = results.filter((r) => r.status === "WARN").length;
console.log(`\nPASS ${results.filter((r) => r.status === "PASS").length} · WARN ${warns} · FAIL ${fails}`);
console.log("\n수동: docs/final-test-checklist.md");
console.log("반응형: npm run check:responsive-qa\n");
process.exit(fails > 0 ? 1 : 0);
