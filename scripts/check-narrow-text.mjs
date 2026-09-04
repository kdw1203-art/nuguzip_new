#!/usr/bin/env node
/**
 * [964] "세로로 길어진 글" 점검 — 칸이 글에 비해 너무 좁은 자리를 찾는다.
 *
 * 왜 필요한가: 글자 크기를 크게 잡아서가 아니라, **뷰포트 기준 분기(`sm:`·`md:`)를
 * 좁은 칸 안에서 써서** 사고가 난다. 화면은 1,290px 인데 그 글이 놓인 사이드바는
 * 340px 이라 `sm:grid-cols-3` 이 참이 되고, 한 칸에 한글 4~5자만 들어가 카드가
 * 세로로 늘어난다(2026-09-04 소유자 캡처 — 홈 AI 정리 카드).
 * 눈으로 보기 전에 숫자로 잡으려고 둔다.
 *
 * 기준: 3줄 이상이면서 **줄당 유효 글자수 8자 미만**. 한글 기준으로 8자보다 짧은 줄이
 * 계속 이어지면 그건 줄바꿈이 아니라 세로쓰기다.
 *
 * 고치는 법(디자인 시스템 §2-1): 글자 크기를 손으로 낮추지 말고 그 상자에 `.fit`,
 * 안쪽 글에 `.t-fit` 을 붙인다 — 램프 안에서 한 단씩 내려가고 자간이 조여지며,
 * 칸이 넓어지면 저절로 돌아온다. 두 칸 비교는 `.fit-pair`.
 *
 * 사용: 빌드 후 `next start -p 3100` 을 띄운 상태에서
 *   PORT=3100 node scripts/check-narrow-text.mjs
 * 서버가 없으면 아무것도 검사하지 않고 통과한다(빌드 체인에 넣지 않는 이유).
 */
import { chromium } from "@playwright/test";

const PORT = process.env.PORT || "3100";
const BASE = `http://localhost:${PORT}`;
const PAGES = (process.env.PAGES || "/,/analysis,/town,/notes,/subscription,/town/experts,/map,/about").split(",");
const VIEWPORTS = [
  [1290, "데스크톱"],
  [390, "모바일"],
];
/** 줄당 이 글자수보다 적으면서 아래 줄 수 이상이면 이탈 */
const MIN_CHARS_PER_LINE = 8;
const MIN_LINES = 3;

async function reachable() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

if (!(await reachable())) {
  console.log(`[check-narrow-text] SKIP — ${BASE} 에 서버가 없습니다 (next start 후 다시 실행)`);
  process.exit(0);
}

const browser = await chromium.launch();
const hits = [];

for (const [width, vLabel] of VIEWPORTS) {
  for (const path of PAGES) {
    const ctx = await browser.newContext({ viewport: { width, height: 1200 } });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try {
        localStorage.setItem("nz-cookie-consent", JSON.stringify({ analytics: false, decidedAt: Date.now() }));
      } catch {}
    });
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);
      const found = await page.evaluate(
        ({ minChars, minLines }) => {
          const out = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
          let el;
          while ((el = walker.nextNode())) {
            if (!(el instanceof HTMLElement) || el.offsetParent === null) continue;
            if (el.children.length > 0) continue; // 텍스트만 가진 잎 요소
            const txt = (el.textContent || "").trim();
            if (txt.length < 12) continue;
            const cs = getComputedStyle(el);
            const fs = parseFloat(cs.fontSize) || 13;
            const lh = parseFloat(cs.lineHeight) || fs * 1.5;
            const rect = el.getBoundingClientRect();
            if (rect.width < 1) continue;
            const lines = Math.max(1, Math.round(rect.height / lh));
            if (lines < minLines) continue;
            const perLine = txt.length / lines;
            if (perLine >= minChars) continue;
            out.push({
              perLine: Math.round(perLine * 10) / 10,
              lines,
              w: Math.round(rect.width),
              fs: Math.round(fs),
              txt: txt.slice(0, 40),
            });
          }
          return out.sort((a, b) => a.perLine - b.perLine).slice(0, 8);
        },
        { minChars: MIN_CHARS_PER_LINE, minLines: MIN_LINES },
      );
      for (const f of found) hits.push({ ...f, path, vLabel });
    } catch (e) {
      console.log(`[check-narrow-text] ${vLabel} ${path} — 열지 못했습니다: ${String(e).slice(0, 60)}`);
    }
    await ctx.close();
  }
}
await browser.close();

if (hits.length === 0) {
  console.log(
    `[check-narrow-text] OK — ${PAGES.length}개 경로 × ${VIEWPORTS.length}폭에서 줄당 ${MIN_CHARS_PER_LINE}자 미만이 ${MIN_LINES}줄 이상 이어지는 블록 0건`,
  );
  process.exit(0);
}

console.error(`[check-narrow-text] 세로로 길어진 글 ${hits.length}건`);
for (const h of hits) {
  console.error(`  ${h.vLabel} ${h.path} — ${h.perLine}자/줄 ${h.lines}줄 (칸 ${h.w}px · ${h.fs}px) | ${h.txt}`);
}
console.error("  고치는 법: 그 상자에 .fit, 안쪽 글에 .t-fit (디자인 시스템 §2-1). 임의 글자 크기 금지.");
process.exit(1);
