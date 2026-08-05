#!/usr/bin/env node
/**
 * standalone(홈 화면에 추가) 안전영역 실측기 — 브라우저 탭 모드와 standalone
 * 모드를 같은 페이지에서 각각 재고, 화면 밖으로 나가는 고정 요소와 탭 가능한
 * 요소끼리의 겹침을 찍어낸다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 * 아이폰 사파리 탭 모드에서는 하단 툴바가 홈 인디케이터를 덮어 주기 때문에
 * `env(safe-area-inset-bottom)` 이 **0 으로 온다.** 즉 탭 모드에서 아무 문제가
 * 없어도 standalone 에서만 깨지는 종류의 버그가 따로 있고, 그건 홈 화면에
 * 추가해서 열어 보기 전에는 아무도 못 본다. 안전영역을 인라인으로 더하는
 * 자리가 저장소에 스무 곳 넘게 흩어져 있어서, 코드만 읽어서는 판정이 안 된다.
 *
 * ── 어떻게 재나 ───────────────────────────────────────────────────────────
 * CDP `Emulation.setSafeAreaInsetsOverride` 로 인셋을 강제로 주입한다.
 * Chromium 141 에서 동작하며, 넣은 값이 실제 `env(safe-area-inset-*)` 로
 * 들어오는 것을 프로브 엘리먼트의 계산된 패딩으로 되읽어 확인한다(주입 34 →
 * 읽기 34px). 되읽기가 어긋나면 **측정 자체를 중단한다** — 인셋이 안 먹은 채
 * 잰 값을 "standalone 결과"로 적으면 그게 제일 나쁘다.
 *
 * ── 한계를 숨기지 않는다 ──────────────────────────────────────────────────
 * 이 컨테이너에서는 Supabase egress 가 막혀 `/map`·`/notes` 가 500 으로 떨어진다.
 * 그 경로는 고정 요소가 0개로 잡히는데 이건 "안전하다"가 아니라 **"못 쟀다"** 다.
 * 페이지가 200 이 아니면 결과에 그렇게 적는다.
 *
 * 사용:
 *   node scripts/audit-standalone-safearea.mjs [http://127.0.0.1:3111]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";
const PAGES = ["/", "/map", "/listings", "/notes", "/town"];

/* iPhone 14 논리 해상도 390x844 기준.
   - 탭 모드: 주소창·툴바가 화면을 먹어 보이는 높이가 734 로 줄고, 하단 툴바가
     홈 인디케이터를 덮으므로 inset-bottom 은 0.
   - standalone: 브라우저 UI 가 없어 844 를 다 쓰고 홈 인디케이터가 드러나
     inset-bottom = 34. inset-top 이 0 인 건 layout 의
     `apple-mobile-web-app-status-bar-style` 이 `default` 라 콘텐츠가 상태바
     **아래**에서 시작하기 때문이다. `black-translucent` 로 바꾸면 여기도 바꿔야
     하고, 그때는 상단 앵커들을 같이 봐야 한다. */
const MODES = [
  { name: "브라우저(탭)", h: 734, insets: { top: 0, bottom: 0, left: 0, right: 0 } },
  { name: "standalone ", h: 844, insets: { top: 0, bottom: 34, left: 0, right: 0 } },
];

const COLLECT = () => {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed") continue;
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    /* 클릭을 통과시키는 층은 무엇도 가리지 않는다 — 안에 실제 컨트롤이
       들어 있는 경우만 남긴다. 이걸 안 거르면 없는 겹침이 잔뜩 나온다. */
    if (cs.pointerEvents === "none" && !el.querySelector("button,a,input")) continue;
    /* 부모가 이미 fixed 면 자식은 그 안의 배치다 — 같은 사각형을 두 번 세게 된다. */
    let anc = el.parentElement;
    let nested = false;
    while (anc) {
      if (getComputedStyle(anc).position === "fixed") {
        nested = true;
        break;
      }
      anc = anc.parentElement;
    }
    if (nested) continue;
    const tag = el.tagName.toLowerCase();
    const cls = typeof el.className === "string" ? el.className : "";
    /* 고정 층 **안의 컨트롤**도 따로 잰다. 실제로 이 점검에서 나온 결함이 전부
       여기였다 — 화면 전체를 덮는 모달 스크림은 바닥까지 닿는 게 정상이지만,
       그 안의 시트에 달린 버튼이 홈 인디케이터 자리로 내려와 있었다. 바깥
       사각형만 보면 스크림이 매번 걸리고(정상인데) 진짜 버튼은 안 걸린다. */
    const controls = [];
    for (const c of el.querySelectorAll("button,a[href],[role=button],input")) {
      const cr = c.getBoundingClientRect();
      if (cr.width < 8 || cr.height < 8) continue;
      const ccs = getComputedStyle(c);
      if (ccs.display === "none" || ccs.visibility === "hidden" || ccs.opacity === "0") continue;
      controls.push({
        b: Math.round(cr.bottom),
        label: (c.getAttribute("aria-label") || c.textContent || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 18),
      });
    }
    out.push({
      controls,
      k: `${tag}.${cls.split(" ").filter(Boolean).slice(0, 2).join(".")}`,
      label: (el.getAttribute("aria-label") || el.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 28),
      z: cs.zIndex,
      t: Math.round(r.top),
      b: Math.round(r.bottom),
      l: Math.round(r.left),
      r: Math.round(r.right),
      h: Math.round(r.height),
      tappable:
        !!el.querySelector("button,a,[role=button],input") || ["button", "a"].includes(tag),
    });
  }
  /* 100vh 계열은 탭 모드에서 잘리는 고전 버그의 출발점이라 개수만 세어 둔다. */
  const vhUse = [...document.querySelectorAll("*")].filter((e) => {
    const s = e.getAttribute("style") || "";
    const c = typeof e.className === "string" ? e.className : "";
    return /100vh/.test(s) || /\[100vh\]|h-screen|min-h-screen/.test(c);
  }).length;
  return { vh, vw, fixed: out, vhUse };
};

/** 주입한 인셋이 실제 env() 로 들어왔는지 되읽는다. */
const PROBE = () => {
  const d = document.createElement("div");
  d.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none;opacity:0;" +
    "padding-bottom:env(safe-area-inset-bottom,0px);padding-top:env(safe-area-inset-top,0px)";
  document.body.appendChild(d);
  const cs = getComputedStyle(d);
  const v = { bottom: parseFloat(cs.paddingBottom) || 0, top: parseFloat(cs.paddingTop) || 0 };
  d.remove();
  return v;
};

const overlap = (a, c) => !(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t);

const browser = await chromium.launch();
let problems = 0;
let unmeasured = 0;

for (const m of MODES) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: m.h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  for (const path of PAGES) {
    const page = await ctx.newPage();
    /* 쿠키 결정 전에는 배너 한 층만 뜨고 탭바가 아예 안 나온다(TabBar.tsx 조기
       반환). 결정을 안 넣고 재면 "탭바가 없다"는 틀린 결과가 나온다. */
    await page.addInitScript(() => {
      localStorage.setItem(
        "nz_cookie_consent",
        JSON.stringify({ analytics: true, decidedAt: "2026-01-01T00:00:00.000Z" }),
      );
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: m.insets });

    let status = 0;
    const res = await page
      .goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 })
      .catch(() => null);
    status = res?.status() ?? 0;
    await page.waitForTimeout(2500);

    const head = `### ${path} | ${m.name}`;
    if (status !== 200) {
      console.log(`\n${head}  → **못 쟀다**: HTTP ${status || "연결 실패"}`);
      unmeasured++;
      await page.close();
      continue;
    }

    const probe = await page.evaluate(PROBE).catch(() => null);
    if (!probe || Math.round(probe.bottom) !== m.insets.bottom) {
      console.log(
        `\n${head}  → **못 쟀다**: 인셋 주입 확인 실패(넣은 ${m.insets.bottom} · 읽은 ${probe ? Math.round(probe.bottom) : "?"})`,
      );
      unmeasured++;
      await page.close();
      continue;
    }

    const d = await page.evaluate(COLLECT);
    console.log(
      `\n${head}  (뷰포트 ${d.vw}x${d.vh} · 인셋 하단 ${Math.round(probe.bottom)} · h-screen류 ${d.vhUse}개)`,
    );
    for (const f of d.fixed) {
      const gap = d.vh - f.b;
      console.log(
        `   ${f.t}→${f.b} (h${f.h}) 아래여백 ${gap} z${f.z} ${f.tappable ? "[탭]" : "    "} ${f.k} ${f.label ? `«${f.label}»` : ""}`,
      );
    }
    const off = d.fixed.filter((f) => f.b > d.vh + 1 || f.t < -1);
    if (off.length) {
      console.log(`   ⚠ 화면 밖: ${off.map((f) => `${f.k} (${f.t}→${f.b})`).join(", ")}`);
      problems += off.length;
    }
    /* 홈 인디케이터 침범 — **컨트롤 기준으로만** 본다.
       화면을 덮는 스크림이 바닥까지 닿는 건 결함이 아니라 의도다. 그걸 매번
       찍어내면 그 순간부터 아무도 안 보는 검사기가 되고, 정작 그 안에서
       인디케이터 자리로 내려온 버튼은 스크림에 가려 안 보인다. */
    if (m.insets.bottom > 0) {
      const safeLine = d.vh - m.insets.bottom;
      const bad = [];
      for (const f of d.fixed)
        for (const c of f.controls ?? [])
          if (c.b > safeLine + 1)
            bad.push(`${f.k} › «${c.label}» (아래여백 ${d.vh - c.b} < ${m.insets.bottom})`);
      if (bad.length) {
        console.log(`   ⚠ 홈 인디케이터 침범(컨트롤): ${bad.join(", ")}`);
        problems += bad.length;
      }
    }
    const ov = [];
    for (let i = 0; i < d.fixed.length; i++) {
      for (let j = i + 1; j < d.fixed.length; j++) {
        const a = d.fixed[i];
        const c = d.fixed[j];
        if (!a.tappable || !c.tappable || !overlap(a, c)) continue;
        /* 화면 전체를 덮는 층(모달 스크림)은 "겹친 것"이 아니라 "덮으려고 만든
           것"이다. 이 예외가 없으면 매번 같은 건을 토해내고, 그 순간부터
           아무도 안 보는 검사기가 된다. */
        const covers = (x) => x.h > d.vh * 0.85;
        if (covers(a) || covers(c)) continue;
        ov.push(`${a.k} ↔ ${c.k}`);
      }
    }
    if (ov.length) {
      console.log(`   ⚠ 탭 가능 요소 겹침: ${ov.join(" · ")}`);
      problems += ov.length;
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();

console.log(
  `\n문제 ${problems}건 · 못 잰 화면 ${unmeasured}개` +
    (unmeasured ? " (못 잰 것은 통과가 아니다 — 위 사유를 보라)" : ""),
);
process.exit(problems > 0 ? 1 : 0);
