#!/usr/bin/env node
/**
 * 반응형·QA 체크리스트 — 실제 코드 기준 자동 점검
 * 사용: node scripts/check-responsive-qa.mjs
 * 수동: 360/390/768/1024/1280/1440 DevTools + 아래 표 참고
 *
 * ── 이 파일을 통째로 다시 쓴 이유 (2026-07) ───────────────────────────────
 * 예전 버전이 참조하던 25개 경로 중 **13개가 존재하지 않는 파일**이었다.
 *   components/site-header.tsx · components/ui/feed-state.tsx · app/pricing/page.tsx
 *   components/native-landing.tsx · app/loading.tsx · components/bookmark-toggle.tsx …
 * 심볼도 마찬가지였다. MOBILE_BOTTOM_TABS · PageLoadingShell · PricingCheckoutButtons
 * · mobileView — 저장소 어디에도 없다.
 *
 * 없는 파일을 읽으면 빈 문자열이 되고, 빈 문자열은 어떤 패턴에도 걸리지 않으니
 * 결과가 조용히 WARN 으로 떨어졌다. 그래서 나온 출력이 "PASS 9 · WARN 12" 인데,
 * 이건 읽는 사람에게 "손볼 곳이 12군데 있다"로 읽힌다. 실제로는 대부분
 * **검사기가 허공을 가리키고 있었을 뿐**이다.
 *
 * 더 나쁜 것도 있었다. `!header.includes('shortLabel: "동네"')` 는 header 가 빈
 * 문자열이라 항상 참이 되어 "커뮤니티 탭 미포함 — AGENTS.md 준수" 를 **PASS** 로
 * 찍었다. 그런데 (a) AGENTS.md 는 이 저장소에 없고, (b) 실제 TabBar 에는 "동네"
 * 탭이 있다. 없는 문서의 없는 규칙을, 반대로 만들어져 있는 코드에 대해, 지켰다고
 * 보고하고 있었다.
 *
 * 점검 도구가 현실을 잘못 보고하는 건 점검을 안 하는 것보다 나쁘다. 없는 문제를
 * 쫓게 만들고, 있는 문제를 가리고, 통과했다는 착각을 준다.
 *
 * 그래서 원칙 세 가지로 다시 썼다.
 *   1. 경로를 박지 않는다. 기능 유무는 **내용**으로 찾는다(리팩터에 견딘다).
 *   2. 찾는 대상이 없으면 그 사실이 결과에 그대로 드러나야 한다. 빈 문자열이
 *      만들어내는 조용한 WARN/PASS 를 허용하지 않는다.
 *   3. 진짜로 아직 안 만든 기능은 WARN 이 아니라 **미구현**으로 적는다.
 *      "확인이 필요한 경고"와 "안 만들었다는 사실"은 서로 다른 정보다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── 소스 인덱스 (한 번만 읽는다) ─────────────────────────────
const SRC_EXT = /\.(ts|tsx|js|jsx|mjs|css)$/;
const SCAN_DIRS = ["app", "components", "lib"];
const SCAN_FILES = ["middleware.ts", "next.config.ts", "next.config.js"];

/**
 * 주석 제거. 주석까지 훑으면 검사기가 스스로를 속인다 — 실제로 이 스크립트를
 * 처음 돌렸을 때 "모바일 목록 fallback PASS" 가 나왔는데, 근거로 잡힌 파일은
 * app/api/redevelopment/projects/route.ts 의 첫 줄 주석 "정비사업장 조회 API —
 * 지도/목록 공용." 이었다. 구현이 아니라 문장이다. 그래서 판정은 코드에서만 한다.
 * (사용자에게 보이는 문자열은 주석이 아니므로 그대로 남는다.)
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // `https://` 의 // 를 주석으로 오인하지 않도록 앞 글자가 : 인 경우는 제외
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

function buildIndex() {
  const out = [];
  const add = (rel, abs) => {
    const src = fs.readFileSync(abs, "utf8");
    out.push({ rel, src, code: stripComments(src) });
  };
  for (const f of SCAN_FILES) {
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs)) add(f, abs);
  }
  const stack = SCAN_DIRS.map((d) => path.join(ROOT, d)).filter((p) => fs.existsSync(p));
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (SRC_EXT.test(e.name)) add(path.relative(ROOT, abs), abs);
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

const INDEX = buildIndex();

/** 코드(주석 제외)에서 파일 찾기. needle 은 문자열 또는 (g 플래그 없는) 정규식. */
function findAll(needle) {
  const hit =
    needle instanceof RegExp ? (s) => needle.test(s) : (s) => s.includes(needle);
  return INDEX.filter((f) => hit(f.code)).map((f) => f.rel);
}
function findOne(needle) {
  return findAll(needle)[0] ?? null;
}
/** 인덱스에서 파일 내용. 없으면 null — 빈 문자열을 반환하지 않는 게 핵심이다. */
function srcOf(rel) {
  const hit = INDEX.find((f) => f.rel === rel);
  return hit ? hit.code : null;
}
/**
 * 내용으로 파일을 찾고 그 내용까지 돌려준다. 못 찾으면 [null, null].
 *
 * needle 은 되도록 **선언**을 가리켜야 한다. `import` 한 쪽도 같은 문자열을
 * 포함하므로, 단순 이름으로 찾으면 인덱스 정렬 순서에 따라 구현 파일 대신
 * 사용처가 잡힌다(첫 실행 때 BREAKPOINT_PX 의 정의를 lib/design 이 아니라
 * lib/analytics 에서 찾아 값 불일치 FAIL 을 냈다).
 *
 * 같은 사고가 두 번째로 났다: 탭바를 `aria-label="하단 내비게이션"` 으로 찾았는데
 * InstallPrompt 의 `querySelector('nav[aria-label="하단 내비게이션"]')` 가 인덱스
 * 순서상 먼저 걸려, 실제로는 `md:hidden` 이 멀쩡히 있는데도 "데스크톱에 하단바
 * 노출" FAIL 을 냈다. 없는 결함을 보고하는 검사기는 있는 결함을 놓치는 검사기보다
 * 나쁘다 — 한 번 거짓으로 빨간불이 되면 그다음부터 아무도 안 본다.
 * 그래서 needle 이 여러 파일에 걸리면 조용히 첫 번째를 쓰지 않고 로그로 드러낸다.
 */
function locate(needle) {
  const all = findAll(needle);
  if (all.length > 1) {
    console.error(
      `[locate] 모호한 needle ${String(needle)} — ${all.length}개 파일에 걸림: ${all.join(", ")}\n` +
        `         첫 번째(${all[0]})를 측정합니다. 선언부만 가리키도록 needle 을 좁히세요.`,
    );
  }
  const rel = all[0] ?? null;
  return rel ? [rel, srcOf(rel)] : [null, null];
}
function basenames(name) {
  return INDEX.filter((f) => path.basename(f.rel) === name).map((f) => f.rel);
}

// ── 결과 ────────────────────────────────────────────────────
const results = [];
const pass = (area, item, detail = "") => results.push({ area, item, status: "PASS", detail });
const warn = (area, item, detail = "") => results.push({ area, item, status: "WARN", detail });
const fail = (area, item, detail = "") => results.push({ area, item, status: "FAIL", detail });
/** 아직 만들지 않은 기능. 경고가 아니라 사실 기록이라 종료 코드에 영향 주지 않는다. */
const todo = (area, item, detail = "") => results.push({ area, item, status: "미구현", detail });

// ── 레이아웃 ─────────────────────────────────────────────
const [bpRel, bpSrc] = locate("export const BREAKPOINT_PX");
if (!bpSrc) {
  fail("레이아웃", "브레이크포인트 단일 정의", "BREAKPOINT_PX 선언을 못 찾음");
} else if (bpSrc.includes("tabletMin: 768") && bpSrc.includes("desktopMin: 1280")) {
  pass("레이아웃", "브레이크포인트 768/1280", bpRel);
} else {
  fail("레이아웃", "브레이크포인트 768/1280", `${bpRel} 값 불일치`);
}

/* Tailwind v4 는 CSS-first 라 tailwind.config.* 가 없다. @theme 에서
   --breakpoint-* 를 재정의하지 않으면 기본값(md 768 · xl 1280)이 그대로 쓰이고,
   그게 위 BREAKPOINT_PX 와 같은 숫자다. 재정의가 생기면 두 값이 갈라지므로
   그때는 수동 대조가 필요하다고 알린다. */
const gcss = srcOf("app/globals.css");
const hasTwConfig = ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs"].some((f) =>
  fs.existsSync(path.join(ROOT, f)),
);
if (gcss === null) {
  fail("레이아웃", "Tailwind 브레이크포인트 일치", "app/globals.css 없음");
} else if (!hasTwConfig && !/--breakpoint-(sm|md|lg|xl)\s*:/.test(gcss)) {
  pass("레이아웃", "Tailwind 브레이크포인트 일치", "기본값 md=768 · xl=1280 = BREAKPOINT_PX");
} else {
  warn("레이아웃", "Tailwind 브레이크포인트 일치", "커스텀 브레이크포인트 — BREAKPOINT_PX 와 수동 대조 필요");
}

const [hookRel] = locate("export function useBreakpoint");
if (hookRel) pass("레이아웃", "useBreakpoint 훅", `${hookRel} · 360~1440 수동 DevTools 권장`);
else fail("레이아웃", "useBreakpoint 훅", "선언을 못 찾음");

/* 반응형은 전부 Tailwind 유틸리티(md:/lg:/xl:)로 처리한다. globals.css 에는 폭
   기반 미디어쿼리가 없다 — 이건 결함이 아니라 구현 방식이므로 사실만 적는다. */
const widthMq = gcss ? (gcss.match(/@media[^{]*\((min|max)-width/g) ?? []).length : 0;
const mdCount = INDEX.filter((f) => /\bmd:/.test(f.src)).length;
pass(
  "레이아웃",
  "반응형 구현 방식",
  `Tailwind 유틸리티 ${mdCount}개 파일에 md: 사용 · globals.css 폭 미디어쿼리 ${widthMq}개`,
);

// ── 내비게이션 ───────────────────────────────────────────
/* JSX 속성으로 **선언된** 자리만 잡는다. 문자열 안에 같은 셀렉터를 담고 있는
   InstallPrompt(배너를 탭바 위에 놓으려고 탭바를 조회한다)나 주석이 걸리지 않게,
   줄 전체가 속성 하나인 형태로 좁혔다. */
const [tabRel, tabSrc] = locate(/^\s*aria-label="하단 내비게이션"\s*$/m);
if (!tabSrc) {
  fail("내비게이션", "모바일 하단 탭바", "aria-label=\"하단 내비게이션\" 을 가진 파일 없음");
} else {
  const block = tabSrc.match(/const TABS\s*=\s*\[[\s\S]*?\n\];/);
  const labels = block ? [...block[0].matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]) : [];
  if (labels.length === 5) {
    pass("내비게이션", "하단 5탭 IA", `${labels.join(" · ")} (${tabRel})`);
  } else if (labels.length > 0) {
    warn("내비게이션", "하단 5탭 IA", `${labels.length}개: ${labels.join(" · ")}`);
  } else {
    warn("내비게이션", "하단 5탭 IA", `${tabRel} 에서 TABS 배열을 파싱하지 못함`);
  }
  if (/center:\s*true/.test(tabSrc)) pass("내비게이션", "중앙 작성 CTA", "center: true 슬롯");
  else warn("내비게이션", "중앙 작성 CTA", "center 슬롯 없음");
  if (tabSrc.includes("md:hidden")) pass("내비게이션", "데스크톱에서 탭바 숨김", "md:hidden");
  else fail("내비게이션", "데스크톱에서 탭바 숨김", "md:hidden 없음 — 데스크톱에 하단바 노출");
  if (tabSrc.includes("safe-area-inset-bottom")) pass("내비게이션", "iOS 홈 인디케이터 여백", "env(safe-area-inset-bottom)");
  else warn("내비게이션", "iOS 홈 인디케이터 여백", "safe-area-inset-bottom 없음");
  if (/aria-current=/.test(tabSrc)) pass("내비게이션", "현재 탭 aria-current");
  else warn("내비게이션", "현재 탭 aria-current", "스크린리더가 현재 위치를 못 읽음");
}

// ── 폼 입력 (터치 타깃) ──────────────────────────────────
/* 44px 는 iOS HIG, 48px 는 Material 권장 최소 터치 타깃. 개별 화면마다 확인하는
   대신, 공용 버튼 토큰이 그 크기를 보장하는지 본다(토큰을 쓰면 전부 따라온다). */
/* 여기서는 선언 하나를 찾는 게 아니라 사용처를 세는 것이므로 locate 를 쓰지
   않는다 — locate 는 여러 파일에 걸리면 "모호한 needle" 로 경고하는데, 이 검사는
   여러 파일에 걸리는 게 정상이다. 정상 동작에 경고를 내는 검사기는 경고를
   무의미하게 만든다. */
const touchUsers = findAll(/min-h-\[(44|48)px\]/);
if (touchUsers.length === 0) {
  warn("폼 입력", "44px+ 터치 타깃 토큰", "min-h-[44px] / min-h-[48px] 사용처 없음 — 수동 QA 필요");
} else {
  pass("폼 입력", "44px+ 터치 타깃 토큰", `${touchUsers[0]} 외 ${touchUsers.length - 1}개 파일`);
}

// ── 성능 (홈 로딩) ───────────────────────────────────────
const home = srcOf("app/page.tsx");
if (home === null) {
  fail("성능", "홈 SSR 데이터", "app/page.tsx 없음");
} else if (/loadNewHomeData|loadHomeData/.test(home) && /export const revalidate\s*=\s*\d+/.test(home)) {
  const rev = home.match(/export const revalidate\s*=\s*(\d+)/);
  pass("성능", "홈 SSR 데이터", `서버 로더 + revalidate=${rev?.[1] ?? "?"}s`);
} else if (/loadNewHomeData|loadHomeData/.test(home)) {
  warn("성능", "홈 SSR 데이터", "서버 로더는 있으나 revalidate 미설정 — 접속마다 재계산");
} else {
  warn("성능", "홈 SSR 데이터", "서버 데이터 로더를 못 찾음");
}

const loadings = basenames("loading.tsx");
if (loadings.length === 0) {
  warn("성능", "라우트 로딩 스켈레톤", "loading.tsx 없음 — 전환 시 빈 화면");
} else {
  const hasRoot = loadings.includes(path.join("app", "loading.tsx"));
  pass(
    "성능",
    "라우트 로딩 스켈레톤",
    `${loadings.length}개 라우트${hasRoot ? " (루트 포함)" : " · 루트 app/loading.tsx 없음(홈은 프리렌더라 영향 작음)"}`,
  );
}

// ── 접근성 ───────────────────────────────────────────────
const layout = srcOf("app/layout.tsx");
if (layout === null) fail("접근성", "본문 skip link", "app/layout.tsx 없음");
else if (layout.includes('href="#main-content"')) pass("접근성", "본문 skip link");
else fail("접근성", "본문 skip link", "app/layout.tsx 에 없음");

if (gcss && /\.sr-only:focus(-visible)?/.test(gcss)) {
  pass("접근성", "skip link 포커스 시 노출", ".sr-only:focus 스타일");
} else {
  fail("접근성", "skip link 포커스 시 노출", "sr-only 가 포커스에도 숨겨진 채라면 skip link 는 무의미");
}

const liveFiles = findAll("aria-live");
if (liveFiles.length === 0) {
  todo("접근성", "전역 라이브 리전", "aria-live 사용처 없음");
} else {
  const toast = liveFiles.find((f) => /toast/i.test(f));
  if (toast) pass("접근성", "전역 라이브 리전", `${toast} 외 ${liveFiles.length - 1}개`);
  else warn("접근성", "전역 라이브 리전", `aria-live ${liveFiles.length}개 — 토스트에는 미적용`);
}

/* 비밀번호 입력이 있는 화면 = 로그인/가입/재설정. 실패 메시지를 스크린리더가
   즉시 읽어야 하는 대표적인 자리라 여기만큼은 개별로 확인한다. */
const pwFiles = findAll('type="password"');
const pwBad = pwFiles.filter((rel) => {
  const s = srcOf(rel) ?? "";
  return !/role="alert"|aria-live=/.test(s);
});
if (pwFiles.length === 0) {
  warn("접근성", "인증 폼 오류 알림", "비밀번호 입력 화면을 못 찾음");
} else if (pwBad.length === 0) {
  pass("접근성", "인증 폼 오류 알림", `${pwFiles.length}개 화면 전부 role=alert/aria-live`);
} else {
  fail("접근성", "인증 폼 오류 알림", `누락: ${pwBad.join(", ")}`);
}

const alertFiles = findAll('role="alert"');
pass("접근성", "role=alert 적용 범위", `${alertFiles.length}개 파일`);

// ── SEO ──────────────────────────────────────────────────
const [altRel, altSrc] = locate("export function seoAlternates");
const [, pageMetaSrc] = locate("export function buildPageMetadata");
if (
  altSrc &&
  altSrc.includes("canonical") &&
  altSrc.includes("x-default") &&
  pageMetaSrc &&
  pageMetaSrc.includes("seoAlternates(")
) {
  pass("SEO", "canonical + hreflang 단일 소스", `${altRel} · buildPageMetadata 경유`);
} else if (altSrc) {
  fail("SEO", "canonical + hreflang 단일 소스", "seoAlternates 는 있으나 buildPageMetadata 가 쓰지 않음");
} else {
  fail("SEO", "canonical + hreflang 단일 소스", "seoAlternates 선언 없음");
}

const mw = srcOf("middleware.ts");
if (mw === null) fail("SEO", "m 서브도메인 canonical redirect", "middleware.ts 없음");
else if (mw.includes("308") && /m\.nuguzip/.test(mw)) pass("SEO", "m 서브도메인 canonical redirect", "308");
else warn("SEO", "m 서브도메인 canonical redirect", "308 + m.nuguzip 패턴을 못 찾음");

/* 공개 라우트의 metadata 커버리지. 로그인·관리자처럼 색인 대상이 아닌 곳은
   빼고 센다 — 제외 목록을 코드에 남겨 두어야 나중에 검증할 수 있다. */
const NOINDEX_ROUTES = new Set([
  "admin", "login", "signup", "forgot-password", "reset-password",
  "notifications", "messages", "my", "apply", "seller", "points", "welcome",
]);
const appDir = path.join(ROOT, "app");
const publicRoutes = [];
if (fs.existsSync(appDir)) {
  for (const e of fs.readdirSync(appDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name === "api" || e.name === "components" || e.name.startsWith("(")) continue;
    if (NOINDEX_ROUTES.has(e.name)) continue;
    if (!fs.existsSync(path.join(appDir, e.name, "page.tsx"))) continue;
    publicRoutes.push(e.name);
  }
}
const noMeta = publicRoutes.filter((r) => {
  const s = srcOf(path.join("app", r, "page.tsx")) ?? "";
  return !/export const metadata|generateMetadata/.test(s);
});
if (publicRoutes.length === 0) {
  warn("SEO", "공개 라우트 metadata", "최상위 공개 라우트를 못 찾음");
} else if (noMeta.length === 0) {
  pass("SEO", "공개 라우트 metadata", `${publicRoutes.length}개 전부 보유`);
} else {
  warn(
    "SEO",
    "공개 라우트 metadata",
    `${publicRoutes.length - noMeta.length}/${publicRoutes.length} 보유 · 누락: ${noMeta.join(", ")}`,
  );
}

// ── 상태 관리 ────────────────────────────────────────────
const [trayRel, traySrc] = locate("export function readCompareTray");
if (traySrc && traySrc.includes("localStorage")) {
  pass("상태 관리", "비교함 localStorage", `${trayRel} · 뷰포트 전환 후 유지는 수동 확인`);
} else if (traySrc) {
  warn("상태 관리", "비교함 localStorage", `${trayRel} 에 localStorage 없음 — 새로고침 시 소실`);
} else {
  todo("상태 관리", "비교함", "비교 트레이 저장소 없음");
}

const [bmRel, bmSrc] = locate("export async function addBookmark");
if (bmSrc) {
  /* 어디에 남는지까지 봐야 "저장된다"고 말할 수 있다. 서버(Supabase)면 기기가
     바뀌어도 남고, localStorage 면 그 브라우저에만, 둘 다 아니면 새로고침에 날아간다. */
  const backend = /getServiceSupabase|supabase/i.test(bmSrc)
    ? "서버 저장(Supabase)"
    : /localStorage/.test(bmSrc)
      ? "브라우저 localStorage"
      : "영속 저장 없음(메모리)";
  if (backend === "영속 저장 없음(메모리)") warn("상태 관리", "북마크 저장", `${bmRel} · ${backend}`);
  else pass("상태 관리", "북마크 저장", `${bmRel} · ${backend}`);
} else {
  todo("상태 관리", "북마크 저장", "북마크 저장소를 못 찾음");
}

// ── 지도 ─────────────────────────────────────────────────
const [mapRel, mapSrc] = locate("OpenStreetMap");
if (mapSrc && /대체 지도|fallback/i.test(mapSrc)) pass("지도", "OSM fallback", mapRel);
else if (mapSrc) warn("지도", "OSM fallback", `${mapRel} 에 OSM 은 있으나 폴백 경로 불명확`);
else fail("지도", "OSM fallback", "네이버 지도 실패 시 대체 수단 없음");

/* 지도↔목록 전환은 "상태로 뷰를 바꾸는 코드"가 있어야 있는 것이다. 주석이나
   설명 문구가 아니라 상태 변수 이름으로 찾는다. */
const mapListToggle = findOne(/\b(mobileView|listViewMode|mapListView|viewMode)\b/);
if (mapListToggle) pass("지도", "모바일 목록 fallback", mapListToggle);
else todo("지도", "모바일 목록 fallback", "지도↔목록 전환 UI 없음 — 저사양/지도 실패 시 대안 부재");

// ── 결제 ─────────────────────────────────────────────────
const [ckRel, ckSrc] = locate("export function PlanCheckoutButton");
if (ckSrc) pass("결제", "웹 checkout CTA", ckRel);
else todo("결제", "웹 checkout CTA", "결제 시작 버튼을 못 찾음");

/* 서버쪽 IAP 영수증 검증은 있는데(app/api/billing/iap/verify), 앱 안에서
   "iOS/Android 는 인앱결제" 라고 알려주는 화면은 없다. 결제 수단이 갈리는데
   안내가 없으면 유저는 웹 결제 화면에서 막힌 이유를 알 수 없다. */
const iapServer = fs.existsSync(path.join(ROOT, "app/api/billing/iap/verify/route.ts"));
const iapNotice = findOne(/인앱\s?결제|앱스토어 결제|In-App Purchase/);
if (iapNotice) {
  pass("결제", "IAP vs 웹 PG 안내", iapNotice);
} else if (iapServer) {
  todo("결제", "IAP vs 웹 PG 안내", "서버 영수증 검증만 존재 · 사용자 안내 UI 없음");
} else {
  todo("결제", "IAP vs 웹 PG 안내", "IAP 경로 자체가 없음");
}

// ── 추적 ─────────────────────────────────────────────────
const [vpRel, vpSrc] = locate("export function buildViewportAnalyticsContext");
if (vpSrc && vpSrc.includes("device_type") && vpSrc.includes("entry_route")) {
  pass("추적", "viewport metadata", vpRel);
} else if (vpSrc) {
  warn("추적", "viewport metadata", `${vpRel} 에 device_type/entry_route 일부 누락`);
} else {
  todo("추적", "viewport metadata", "viewport 컨텍스트 모듈 없음");
}

/* withViewportMetadata() 는 있지만 그걸 붙여 실제로 이벤트를 쏘는 곳이 없다.
   함수가 존재한다는 이유로 PASS 를 주면 "계측이 돌고 있다"는 잘못된 인상을 준다. */
const emitter = findOne("viewport_group_change");
if (emitter) pass("추적", "viewport_group_change 발신", emitter);
else todo("추적", "viewport_group_change 발신", "발신부 미구현 — withViewportMetadata 헬퍼만 존재");

// ── 출력 ─────────────────────────────────────────────────
console.log("\n=== 반응형 QA 체크리스트 (자동) ===\n");
console.log("| 영역 | 항목 | 상태 | 비고 |");
console.log("|------|------|------|------|");
for (const r of results) {
  const note = r.detail ? r.detail.replace(/\|/g, "\\|") : "";
  console.log(`| ${r.area} | ${r.item} | ${r.status} | ${note} |`);
}

const count = (s) => results.filter((r) => r.status === s).length;
const fails = count("FAIL");
console.log(
  `\nPASS ${count("PASS")} · WARN ${count("WARN")} · FAIL ${fails} · 미구현 ${count("미구현")}\n`,
);

const todos = results.filter((r) => r.status === "미구현");
if (todos.length > 0) {
  console.log("미구현 — 검사기가 못 찾은 게 아니라, 아직 만들지 않은 기능:");
  for (const t of todos) console.log(`  - [${t.area}] ${t.item}${t.detail ? ` — ${t.detail}` : ""}`);
  console.log("");
}

console.log(`검사 대상 소스 ${INDEX.length}개 파일 (app · components · lib · middleware)`);
console.log("수동 DevTools 해상도: 360 · 390 · 768 · 1024 · 1280 · 1440");
console.log("수동 확인: 북마크/비교 뷰포트 전환, 키보드 Tab 포커스, 결제 실제 플로우\n");

process.exit(fails > 0 ? 1 : 0);
