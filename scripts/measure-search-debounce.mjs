#!/usr/bin/env node
/**
 * 검색 인풋 디바운스 실측기 (최적화 50선 39번).
 *
 * ── 왜 코드를 읽는 걸로는 부족한가 ────────────────────────────────────────
 * 저장소에는 디바운스 값이 180·200·250·280ms 로 흩어져 있다. 숫자만 보고
 * "다 디바운스 걸려 있으니 됐다"고 적기 쉬운데, 디바운스가 실제로 요청을
 * 줄이는지는 **사람이 얼마나 빨리 치느냐**에 달려 있다. 타이핑 간격이 디바운스
 * 값보다 길면 타이머는 매 글자마다 만료되고, 결과적으로 **글자 수만큼 요청이
 * 나간다**. 즉 "디바운스 있음"과 "요청이 줄어듦"은 다른 말이다.
 *
 * 그래서 실제 입력 속도별로 타이핑을 재현하고 나간 요청을 센다.
 * 판정 기준은 값이 몇 ms 인지가 아니라 **한 번 검색할 때 요청이 몇 번 나가는지**다.
 *
 * ── 두 가지 입력을 따로 잰다 ─────────────────────────────────────────────
 * Playwright 의 `input.type()` 은 키 이벤트만 쏘고 **조합(composition) 이벤트를
 * 만들지 않는다**. 한글 글자를 넣어도 브라우저가 실제 한글 입력에서 만드는
 * compositionstart/update 가 안 온다. 그래서 이 경로로 잰 값은 "한글 검색"이
 * 아니라 **영문·숫자처럼 조합 없는 입력**의 값이다. 그걸 한글 결과라고 적으면
 * 없는 안내보다 나쁜 틀린 안내가 된다.
 *
 *   A. 비조합 입력 — page.type(). 영문·숫자 입력에 해당.
 *   B. 한글 IME  — CDP `Input.imeSetComposition` 으로 2벌식 조합 상태를 그대로
 *      재현. 이 사이트에서 사람이 실제로 치는 방식이다(단지명·지역명은 한글).
 *
 * 게이트는 B(한글)에 건다. A 는 "요청이 키 입력 수를 넘지 않는다"만 본다 —
 * 디바운스는 '입력 간격 > 대기 시간'이면 원리상 글자마다 나가게 되어 있고,
 * 이걸 없애려면 대기 시간을 380ms 이상으로 올려야 하는데 그러면 빠르게 치는
 * 사람 **전원**이 매 검색마다 그만큼 더 기다린다. 드문 느린 영문 입력을 위해
 * 흔한 입력을 느리게 만드는 건 남는 장사가 아니라고 판단했다. 판단을 숨기지
 * 않으려고 A 수치를 그대로 찍는다.
 *
 * ── 속도 근거 ────────────────────────────────────────────────────────────
 * 120ms/자 = 물리 키보드로 익숙한 단어를 칠 때, 220ms/자 = 폰 한 손 입력의
 * 흔한 구간, 380ms/자 = 낯선 단지명을 더듬어 칠 때. 마지막 구간이 이 사이트의
 * 실제 사용에 가깝다 — 사람들은 아는 단어가 아니라 모르는 단지명을 친다.
 *
 * 사용:
 *   node scripts/measure-search-debounce.mjs [http://127.0.0.1:3111]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";

/* 검색 요청으로 셀 엔드포인트. 여기 없는 경로는 안 센 것이므로 목록을 남긴다. */
const SEARCH_API = /\/api\/(search\/(unified|suggest)|map\/geocode)/;

const SPEEDS = [
  { name: "빠름 120ms/자", delay: 120 },
  { name: "보통 220ms/자", delay: 220 },
  { name: "더듬 380ms/자", delay: 380 },
];

/* 7글자 — 단지명 검색의 현실적인 길이("래미안원베일리"). 짧게 치면 디바운스가
   좋아 보이고, 길게 치면 나빠 보인다. 실제 길이로 잰다. */
const QUERY = "래미안원베일리";

/* 2벌식으로 "래미안"을 칠 때 IME 가 실제로 만드는 조합 상태 7개(키 7번:
   ㄹㅐㅁㅣㅇㅏㄴ). 마지막 상태는 **조합을 닫지 않는다** — 실제 한글 IME 도
   사용자가 손을 떼면 마지막 음절을 열어 둔 채 대기하고, 그래서
   compositionend 를 기다리는 구현은 검색이 영영 안 나간다. 여기서도 안 닫아야
   그 함정을 실제로 통과하는지 확인할 수 있다.
   키 수를 A 경로(7자)와 똑같이 맞춰 두 경로를 나란히 비교한다. */
const IME_STATES = ["ㄹ", "라", "래", "램", "래미", "래민", "래미안"];

const TARGETS = [
  {
    name: "통합검색 헤더(HeaderSearch)",
    url: "/",
    width: 1280,
    /* 헤더 검색은 lg 이상에서만 보인다(hidden lg:block). 좁은 폭에서 재면
       "요청 0건"이 나오는데 그건 절제가 아니라 입력창이 없는 것이다. */
    selector: 'header input[type="search"]',
  },
  {
    name: "통합검색 페이지(search-client)",
    url: "/search",
    width: 1280,
    selector: 'input[aria-label="통합 검색"]',
  },
  {
    name: "지도 검색(MapSearchBox)",
    url: "/map",
    width: 1280,
    selector: 'input[aria-label="단지·주소 검색"]',
  },
];

/** 한 번의 측정 — 컨텍스트를 새로 열어 페이지 상태가 이월되지 않게 한다. */
async function measure(browser, t, sp, mode) {
  const ctx = await browser.newContext({ viewport: { width: t.width, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      window.localStorage.setItem("nz_tour_map", "1");
    } catch {
      /* 저장소가 막힌 컨텍스트면 그냥 진행 */
    }
  });
  const page = await ctx.newPage();
  await page.route(/oapi\.map\.naver\.com|nrbe\.pstatic\.net|googletagmanager/, (r) => r.abort());

  let hits = 0;
  const seen = [];
  page.on("request", (req) => {
    const u = req.url();
    if (!SEARCH_API.test(u)) return;
    hits += 1;
    /* 무엇을 물어봤는지도 남긴다 — "요청 7건"보다 ["ㄹ","라","래"…] 가
       왜 낭비인지 훨씬 분명하게 보여 준다. */
    try {
      const q = new URL(u).searchParams.get("q");
      if (q) seen.push(q);
    } catch {
      /* 파싱 실패는 셈에 영향 없음 */
    }
  });

  try {
    await page.goto(`${BASE}${t.url}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);

    const input = page.locator(t.selector).first();
    if ((await input.count()) === 0) {
      return { target: t.name, mode, speed: sp.name, hits: null, seen: [], note: "입력창을 찾지 못함" };
    }
    await input.click({ timeout: 5000 }).catch(() => {});
    hits = 0; /* 포커스만으로 나가는 요청(최근검색 등)은 타이핑 비용이 아니다 */
    seen.length = 0;

    if (mode === "raw") {
      await input.type(QUERY, { delay: sp.delay });
    } else {
      /* CDP 로 실제 조합 상태를 순서대로 밀어 넣는다. 마지막 상태에서
         조합을 닫지 않는다(실제 한글 IME 와 동일). */
      const cdp = await ctx.newCDPSession(page);
      for (const state of IME_STATES) {
        await cdp.send("Input.imeSetComposition", {
          text: state,
          selectionStart: state.length,
          selectionEnd: state.length,
        });
        await page.waitForTimeout(sp.delay);
      }
    }
    /* 마지막 입력 뒤 대기 시간이 만료될 시간을 준다. 조합 중 대기(500ms)까지
       덮으려면 넉넉해야 한다 — 안 기다리면 마지막 한 건이 빠져 실제보다
       좋아 보인다. */
    await page.waitForTimeout(1500);

    return { target: t.name, mode, speed: sp.name, hits, seen: [...seen], note: "" };
  } finally {
    await ctx.close();
  }
}

const MODES = [
  { key: "ime", label: "B. 한글 IME 조합 입력 (CDP · 실제 한글 입력 방식)", gate: true },
  { key: "raw", label: "A. 비조합 입력 (영문·숫자 상당 · 조합 이벤트 없음)", gate: false },
];

async function run() {
  const browser = await chromium.launch();
  const rows = [];

  for (const mode of MODES) {
    for (const t of TARGETS) {
      for (const sp of SPEEDS) {
        rows.push(await measure(browser, t, sp, mode.key));
      }
    }
  }

  await browser.close();

  let bad = 0;
  for (const mode of MODES) {
    const label =
      mode.key === "ime"
        ? `"래미안" 조합 ${IME_STATES.length}단계`
        : `"${QUERY}" ${QUERY.length}자`;
    console.log(`\n${mode.label} — ${label} 입력 시 나간 검색 API 요청 수`);
    if (!mode.gate) {
      console.log(
        "   (게이트 대상 아님. 대기 시간을 입력 간격보다 길게 잡지 않는 한 원리상 " +
          "글자마다 나간다. 여기서는 '키 입력 수를 넘지 않는가'만 본다.)",
      );
    }
    let last = "";
    for (const r of rows.filter((x) => x.mode === mode.key)) {
      if (r.target !== last) {
        console.log(` ${r.target}`);
        last = r.target;
      }
      if (r.hits === null) {
        console.log(`   ${r.speed}: — (${r.note})`);
        bad += 1;
        continue;
      }
      const keys = mode.key === "ime" ? IME_STATES.length : QUERY.length;
      /* 이상적인 값은 1건이다(마지막 확정 입력 한 번). 2건까지는 지오코딩처럼
         한 입력에 두 엔드포인트를 부르는 화면이 있어 허용한다. */
      const limit = mode.gate ? 2 : keys * 2;
      const over = r.hits > limit;
      if (over) bad += 1;
      const detail = r.seen.length > 0 && r.hits > 2 ? ` ${JSON.stringify(r.seen.slice(0, 8))}` : "";
      const verdict = over ? `초과(상한 ${limit})` : mode.gate ? "OK" : `키 ${keys}회 이내`;
      console.log(`   ${r.speed}: ${r.hits}건 ${verdict}${detail}`);
    }
  }

  console.log(`\n초과/미측정 ${bad}건`);
  console.log(
    "주의: 이 환경은 Supabase 로 나가지 못해 API 가 빈 결과를 빨리 돌려준다. " +
      "요청 '수'는 실제와 같지만 응답 지연에 따른 체감은 재지 않았다.",
  );
  process.exit(bad === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
