#!/usr/bin/env node
/**
 * /map 오버레이 겹침 실측기 — 코드를 읽어 짐작하지 않고, 실제로 그려진
 * 사각형을 재서 겹치는 쌍을 찍어낸다.
 *
 * ── 왜 이 스크립트가 필요한가 ─────────────────────────────────────────────
 * /map 의 떠 있는 요소(검색바·줌 탭·필터 칩·범례·안내·버튼)는 전부 손으로 쓴
 * `top/bottom: calc(env(safe-area-inset-*) + Npx)` 오프셋으로 자리를 잡는다.
 * 최적화 웨이브를 거치며 이 숫자가 스무 개 넘게 쌓였고, 서로 몇 px 씩 침범해도
 * 코드만 봐서는 아무도 모른다. 실제로 소유자 화면에서 절단 안내가 검색바 밑에
 * 4px 만 보이는 상태로 몇 주를 지냈다. **가려진 안내는 없는 안내와 같다.**
 *
 * 그래서 판정 기준을 "코드가 그럴듯한가"에서 "화면에서 겹치는가"로 옮긴다.
 * 겹침은 getBoundingClientRect 로 잰 사각형의 교집합이 임계 면적을 넘는 경우다.
 *
 * ── 한계를 숨기지 않는다 ──────────────────────────────────────────────────
 * 이 컨테이너에서는 Supabase egress 가 막혀 지도 데이터가 비어 있고, 네이버 지도
 * SDK 도 내려받지 못한다. 그래서 **데이터에 따라 나타나는 오버레이**(마커,
 * 일부 안내 카드)는 이 측정에 포함되지 않는다. 측정된 것만 측정했다고 적는다 —
 * 통과했다고 전부 안전하다고 쓰면 그게 바로 틀린 안내다.
 *
 * 사용:
 *   node scripts/measure-map-overlays.mjs [http://127.0.0.1:3111]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";

/* 겹침으로 볼 최소 교집합 면적(px²). 1~2px 의 반올림 접촉까지 잡으면 잡음만
   늘어난다. 24 = 대략 6×4px — 글자 한 획이 가려지기 시작하는 크기. */
const MIN_OVERLAP_AREA = 24;

/* md-768 은 md 브레이크포인트의 가장 좁은 끝이다. 여기서 사이드바(0~356)와
   우측 범례 열(498~698)이 거의 맞붙어 좌하단 범례에 남는 가로 예산이 130px
   밖에 안 된다. 넓은 md 만 재면 "md 는 괜찮다"는 틀린 기록이 남는다. */
const VIEWPORTS = [
  { name: "mobile-402", width: 402, height: 874, mobile: true },
  { name: "md-768", width: 768, height: 1024, mobile: false },
  { name: "md-834", width: 834, height: 1112, mobile: false },
  { name: "lg-1280", width: 1280, height: 800, mobile: false },
];

/* 화면 거의 전체를 덮는 층(모달 스크림, SDK 실패 폴백 배경)은 겹침 판정에서
   뺀다. 그건 "겹친 것"이 아니라 "덮으려고 만든 것"이다. 이 예외를 두지 않으면
   검사기가 매번 수십 건을 토해내고, 그 순간부터 아무도 안 보는 검사기가 된다. */
const FULLSCREEN_RATIO = 0.85;

const MEASURE = () => {
  /* 오버레이는 전부 지도 셸의 형제로 놓인다. 가장 많은 absolute 자식을 가진
     컨테이너를 셸로 본다 — 경로/클래스명을 박으면 리팩터 한 번에 조용히
     아무것도 못 재는 검사기가 된다. */
  const candidates = new Map();
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "absolute" && cs.position !== "fixed") continue;
    const p = el.parentElement;
    if (!p) continue;
    candidates.set(p, (candidates.get(p) ?? 0) + 1);
  }
  let shell = null;
  let best = 0;
  for (const [p, n] of candidates) {
    if (n > best) {
      best = n;
      shell = p;
    }
  }
  if (!shell) return { error: "오버레이 셸을 찾지 못함", boxes: [] };

  const visible = (el, r) => {
    if (r.width < 4 || r.height < 4) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (Number(cs.opacity) < 0.05) return false;
    return true;
  };

  const label = (el) => {
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 42);
    const tag = el.tagName.toLowerCase();
    const data = el.getAttribute("data-tour");
    return `${tag}${data ? `[${data}]` : ""}: ${t || "(빈 텍스트)"}`;
  };

  const boxes = [];
  for (const el of Array.from(shell.children)) {
    const cs = getComputedStyle(el);
    if (cs.position !== "absolute" && cs.position !== "fixed") continue;
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    boxes.push({
      label: label(el),
      z: cs.zIndex === "auto" ? 0 : Number(cs.zIndex),
      pointerEvents: cs.pointerEvents,
      left: Math.round(r.left),
      top: Math.round(r.top),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
    });
  }
  return { boxes, shellChildren: shell.children.length };
};

function overlaps(a, b, minArea) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (w <= 0 || h <= 0) return null;
  const area = w * h;
  if (area < minArea) return null;
  return { w, h, area };
}

const rect = (b) => `[${b.left},${b.top}]~[${b.right},${b.bottom}]`;

async function run() {
  const browser = await chromium.launch();
  let bad = 0;
  let measured = 0;

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.mobile ? 3 : 2,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    /* 첫 방문 코치마크는 화면을 덮어 아래 오버레이를 못 만지게 한다. 측정
       대상이 아니므로 "이미 본 상태"로 두고 시작한다. */
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem("nz_tour_map", "1");
      } catch {
        /* 저장소가 막힌 컨텍스트면 그냥 진행한다 */
      }
    });
    const page = await ctx.newPage();
    /* 네이버 지도 SDK 는 이 컨테이너에서 못 받는다. 30초를 기다리는 대신
       즉시 실패시켜 측정 시간을 줄인다(오버레이는 SDK 와 무관하게 그려진다). */
    await page.route(/oapi\.map\.naver\.com|nrbe\.pstatic\.net|googletagmanager/, (r) => r.abort());

    /* 조건부 오버레이(매물 안내 범례 C8, 상세 필터 패널, 접이식 범례)는 켜 봐야
       자리를 안다. 안 켜고 "겹침 0" 이라고 쓰면 그게 틀린 안내다. */
    const states = [
      { name: "기본", url: "/map", act: async () => {} },
      {
        name: "범례 펼침",
        url: "/map",
        act: async (p) => {
          const btn = p.locator("button[aria-expanded]:visible", { hasText: "범례" }).first();
          if (await btn.count()) await btn.click({ timeout: 3000 }).catch(() => {});
          await p.waitForTimeout(400);
        },
      },
      /* ?type=sale 이 오면 filtersExpanded 초기값이 true 다(map-client.tsx).
         즉 이 URL 은 "필터 접힘"이 아니라 "필터 자동 펼침" 상태이고, 아래에서
         토글을 누르면 여는 게 아니라 닫는다. 상태 이름을 화면과 반대로 적어
         두면, 통과했다는 기록이 실제로 무엇을 통과시켰는지 아무도 모른다. */
      { name: "매물 ON(필터 자동 펼침)", url: "/map?type=sale", act: async () => {} },
      {
        name: "매물 ON + 필터 접음",
        url: "/map?type=sale",
        act: async (p) => {
          const btn = p.locator("button[data-tour='map-filter']:visible").first();
          if (await btn.count()) await btn.click({ timeout: 3000 }).catch(() => {});
          await p.waitForTimeout(400);
        },
      },
    ];

    for (const st of states) {
      await page.goto(`${BASE}${st.url}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(2200);
      await st.act(page);
      const res = await page.evaluate(MEASURE);
      if (res.error) {
        console.log(`FAIL ${vp.name} / ${st.name}: ${res.error}`);
        bad += 1;
        continue;
      }
      measured += 1;
      const vpArea = vp.width * vp.height;
      const boxes = res.boxes.filter(
        (b) => (b.right - b.left) * (b.bottom - b.top) < vpArea * FULLSCREEN_RATIO,
      );
      const skipped = res.boxes.length - boxes.length;
      const hits = [];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          /* 둘 다 클릭을 통과시키는(pointer-events:none) 순수 장식이라도 글자가
             겹치면 읽을 수 없다 — 그래서 pointer-events 로 봐주지 않는다. */
          const o = overlaps(a, b, MIN_OVERLAP_AREA);
          if (o) hits.push({ a, b, o });
        }
      }
      const tag = `${vp.name} / ${st.name}`;
      const note = skipped > 0 ? ` (전면 층 ${skipped}개 제외)` : "";
      if (hits.length === 0) {
        console.log(`PASS ${tag} — 보이는 오버레이 ${boxes.length}개, 겹침 0${note}`);
      } else {
        bad += hits.length;
        console.log(`FAIL ${tag} — 보이는 오버레이 ${boxes.length}개, 겹침 ${hits.length}쌍${note}`);
        for (const { a, b, o } of hits) {
          console.log(`   ${o.w}×${o.h}px  z${a.z} ${rect(a)} ${a.label}`);
          console.log(`               ↕ z${b.z} ${rect(b)} ${b.label}`);
        }
      }
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n측정 조합 ${measured}개 · 겹침 ${bad}건`);
  console.log(
    "주의: 이 환경은 Supabase·지도 SDK 로 나가지 못한다. 데이터에 따라 나타나는 " +
      "오버레이(마커, 조회 실패 안내 등)는 위 측정에 포함되지 않았다.",
  );
  process.exit(bad === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
