#!/usr/bin/env node
/* 표준 UI QA 스크린샷 러너 — 운영 체계 P5 (docs/ops/operating-system.md).
 *
 * 목적: "화면 QA 를 사람 기억에 의존하지 않는다." 배포 전·후 같은 화면을
 * 같은 뷰포트로 캡처해 눈으로 비교한다. 매번 손으로 짜던 Playwright
 * 원샷 스크립트를 이 파일 하나로 표준화한다.
 *
 * 전제(로컬 상대): 프로덕션 모드 서버가 떠 있어야 한다.
 *   npm run build && AUTH_SECRET=qa-dummy npm run start
 *   (AUTH_SECRET 더미가 없으면 인증을 지나는 페이지가 500 으로 죽는다)
 *
 * 사용:
 *   node scripts/qa-shots.mjs                    # 기본 루트: / /town /analysis
 *   node scripts/qa-shots.mjs /map /search       # 지정 루트만
 *   QA_BASE=https://naezipnow.com node scripts/qa-shots.mjs   # 배포 후 프로덕션 확인
 *   QA_FULL=1 node scripts/qa-shots.mjs          # 접힌 부분까지 전체 페이지 캡처
 *   QA_CHROME=/path/to/chrome                    # 크로뮴 실행 파일 강제 지정
 *
 * 출력: /tmp/qa/<slug>-<width>.png + 결과 표. 실패가 하나라도 있으면 exit 1.
 * 쿠키 배너·베타 모달은 앱과 같은 키·형식으로 localStorage 를 시드해 잠재운다
 * (배너가 화면을 가리면 QA 가 아니라 배너 캡처가 된다).
 */

import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT_DIR = process.env.QA_OUT || "/tmp/qa";
const FULL = process.env.QA_FULL === "1";
const WAIT_MS = Number(process.env.QA_WAIT_MS || 2200);

const DEFAULT_ROUTES = ["/", "/town", "/analysis"];
const routes = process.argv.slice(2).filter((a) => a.startsWith("/"));
const targets = routes.length > 0 ? routes : DEFAULT_ROUTES;

const VIEWPORTS = [
  { width: 1280, height: 900, tag: "desktop" },
  { width: 390, height: 844, tag: "mobile" },
];

/** 이 샌드박스의 기본 크로뮴. 없으면 Playwright 기본 해석에 맡긴다. */
const SANDBOX_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

function slugOf(route) {
  if (route === "/") return "home";
  return route.replace(/^\/+|\/+$/g, "").replace(/[/?&=%]+/g, "-").slice(0, 60) || "page";
}

/** 앱 실제 저장 형식과 동일하게 시드 — BetaNoticeModal / use-cookie-consent 참조 */
function seedScript() {
  return `
    try {
      localStorage.setItem("nuguzip:beta-notice-v1", ${JSON.stringify(new Date().toISOString())});
      localStorage.setItem("nz_cookie_consent", ${JSON.stringify(JSON.stringify({ analytics: false, decidedAt: new Date().toISOString() }))});
    } catch {}
  `;
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright 를 찾지 못했습니다. 설치: npm i -g playwright (브라우저는 PLAYWRIGHT_BROWSERS_PATH 재사용)");
  process.exit(2);
}

mkdirSync(OUT_DIR, { recursive: true });

const executablePath =
  process.env.QA_CHROME || (existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const results = [];
for (const route of targets) {
  for (const vp of VIEWPORTS) {
    const file = join(OUT_DIR, `${slugOf(route)}-${vp.width}.png`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.tag === "mobile" ? 2 : 1,
      locale: "ko-KR",
    });
    try {
      await context.addInitScript(seedScript());
      const page = await context.newPage();
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(WAIT_MS);
      await page.screenshot({ path: file, fullPage: FULL });
      results.push({ route, vp: vp.tag, ok: true, file });
    } catch (e) {
      results.push({ route, vp: vp.tag, ok: false, file: e?.message?.slice(0, 90) ?? "실패" });
    } finally {
      await context.close();
    }
  }
}
await browser.close();

let failed = 0;
console.log(`\nQA 캡처 — 기준: ${BASE}${FULL ? " (전체 페이지)" : ""}`);
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`  ${r.ok ? "OK  " : "FAIL"}  ${r.route.padEnd(14)} ${r.vp.padEnd(8)} ${r.file}`);
}
console.log(failed === 0 ? "\n전 화면 캡처 완료 — 눈으로 확인하세요." : `\n${failed}건 실패 — 서버 기동/AUTH_SECRET 더미부터 확인.`);
process.exit(failed === 0 ? 0 : 1);
