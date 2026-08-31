#!/usr/bin/env node
/**
 * 빈 공간 검사 — 화면에 "아무것도 없는 세로 구간"이 남아 있는지 실제로 잰다.
 *
 * 정적 검사로는 못 잡는 결함이다. 클래스만 봐서는 그 상자가 화면에서 비는지
 * 알 수 없고, 비는 이유도 여럿이다(조건부 블록 꺼짐 · 등장 연출이 자리만
 * 잡고 안 채움 · 고정 높이 자리표시자 · 광고 미부착). 그래서 진짜 브라우저로
 * 띄워 **픽셀 줄 단위로** 내용 유무를 표시하고, 빈 구간이 임계값보다 길면
 * 실패시킨다.
 *
 * 빌드 게이트 체인에는 넣지 않는다 — 서버 기동과 브라우저가 필요해서 윈도우
 * 개발 머신의 빌드를 느리게 만든다. 화면을 크게 손댄 뒤에만 돌린다:
 *
 *   npm run build && npm start        (다른 창에서)
 *   npm run check:void
 *
 * 옵션(환경변수): VOID_BASE(기본 http://127.0.0.1:3000) · VOID_MAX(140)
 *                VOID_PAGES(쉼표 구분) · VOID_W/VOID_H(1412x900)
 */

const BASE = process.env.VOID_BASE || "http://127.0.0.1:3000";
const MAX_VOID = Number(process.env.VOID_MAX || 140);
const W = Number(process.env.VOID_W || 1412);
const H = Number(process.env.VOID_H || 900);
const PAGES = (process.env.VOID_PAGES || "/,/map,/notes,/town,/analysis,/subscription")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** 페이지 안에서 도는 코드 — 내용이 그려진 픽셀 줄을 표시하고 빈 구간을 뽑는다 */
function measure(maxVoid) {
  const docH = document.documentElement.scrollHeight;
  const filled = new Uint8Array(docH + 8);
  const mark = (top, h) => {
    const a = Math.max(0, Math.floor(top));
    const z = Math.min(docH, Math.ceil(top + h));
    for (let y = a; y < z; y++) filled[y] = 1;
  };
  const sy = window.scrollY;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.nextNode(); el; el = walker.nextNode()) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    if (cs.position === "fixed" || cs.position === "sticky") continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const isLeafText = el.children.length === 0 && (el.textContent || "").trim().length > 0;
    const isMedia = /^(IMG|SVG|CANVAS|IFRAME|VIDEO|INPUT|BUTTON|HR|TEXTAREA|SELECT)$/.test(el.tagName);
    if (isLeafText || isMedia) mark(r.top + sy, r.height);
  }
  const voids = [];
  let start = -1;
  for (let y = 0; y <= docH; y++) {
    if (!filled[y]) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      if (y - start >= maxVoid) voids.push({ from: start, to: y, h: y - start });
      start = -1;
    }
  }
  /* 문서 끝의 여백은 푸터 아래 스크롤 여유라 세지 않는다 */
  return { docH, voids };
}

async function main() {
  let chromium;
  for (const mod of ["playwright", "@playwright/test"]) {
    try {
      ({ chromium } = await import(mod));
      break;
    } catch {
      /* 다음 후보 */
    }
  }
  if (!chromium) {
    console.error("✗ playwright 가 없습니다. `npx playwright install chromium` 후 다시 실행하세요.");
    process.exit(2);
  }
  /* --no-sandbox: CI·컨테이너에서 기동 실패를 막는다(로컬 개발 머신에선 무해) */
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: "ko-KR" });
  const page = await ctx.newPage();
  let failed = 0;

  for (const path of PAGES) {
    const url = BASE.replace(/\/$/, "") + path;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    } catch (e) {
      console.error(`✗ ${path} — 열지 못했습니다 (${String(e).split("\n")[0]})`);
      failed++;
      continue;
    }
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(220);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2_500);

    const { docH, voids } = await page.evaluate(measure, MAX_VOID);
    if (voids.length === 0) {
      console.log(`✓ ${path}  (문서 ${docH}px · ${MAX_VOID}px 이상 빈칸 없음)`);
    } else {
      failed++;
      console.error(`✗ ${path}  빈칸 ${voids.length}곳 (문서 ${docH}px)`);
      for (const v of voids) console.error(`    ${v.h}px  y ${v.from}~${v.to}`);
    }
  }

  await browser.close();
  if (failed) {
    console.error(
      `\n빈 공간 검사 실패 — ${failed}개 경로.\n` +
        "고칠 곳은 셋 중 하나입니다: ① 내용 없이 그려진 상자(AutoStack/Section 으로 감싸기)\n" +
        "② data-autotrim 이 안 붙은 컨테이너 ③ 내용보다 큰 고정 높이(min-h/h-[])",
    );
    process.exit(1);
  }
  console.log(`\n✓ 빈 공간 검사 통과 — ${PAGES.length}개 경로`);
}

main().catch((e) => {
  console.error("✗ 검사 중 오류:", e);
  process.exit(2);
});
