#!/usr/bin/env node
/**
 * 콘솔 소음 실측기 (최적화 50선 42·43번) — "경고 없겠지"를 "경고 몇 건인지"로 바꾼다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 * 42번은 "콘솔 경고 0 확인", 43번은 "React key 경고 전수"다. 둘 다 원래 문장이
 * *확인*으로 적혀 있는데, 확인이란 건 세어 본 사람이 있을 때만 성립한다.
 * 빌드 로그에는 런타임 경고가 안 남는다 — key 경고는 브라우저 콘솔에만 뜬다.
 * 그래서 실제로 페이지를 열고 콘솔을 받아 적는다.
 *
 * ── 두 가지 함정 ─────────────────────────────────────────────────────────
 * (1) **프로덕션 빌드에서는 React key 경고가 아예 안 뜬다.** 개발 빌드에만 있는
 *     검사이기 때문이다. 프로덕션 서버만 재고 "key 경고 0건"이라고 적으면 그건
 *     측정이 아니라 착시다. 그래서 이 스크립트는 어느 React 빌드를 보고 있는지
 *     먼저 판정하고, 판정이 안 되면 "불명"이라고 적는다. 43번 결론은 개발
 *     서버(dev)에서 잰 결과로만 쓸 수 있다.
 * (2) 이 컨테이너는 Supabase·네이버 지도 SDK 로 나가지 못한다. 그래서 fetch
 *     실패가 콘솔에 쏟아지는데, 그건 코드 결함이 아니라 환경 한계다. 둘을 한
 *     숫자로 합치면 아무도 안 보는 검사기가 된다 — 원인별로 나눠 적고, 게이트
 *     판정은 **코드 원인**에만 건다.
 *
 * 사용:
 *   node scripts/measure-console-noise.mjs [http://127.0.0.1:3111]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";

/* 공개 표면에서 사람이 가장 많이 지나는 경로 + 목록/상세/폼이 한 번씩 들어가게
   골랐다. 전 라우트(135개)를 다 돌면 5분이 넘고, 그러면 아무도 안 돌린다. */
const ROUTES = [
  "/",
  "/map",
  "/tx",
  "/complex",
  "/listings",
  "/glossary",
  "/notes",
  "/analysis",
  "/region",
  "/guides",
  "/qna",
  "/calculator",
  "/login",
  "/my",
];

/* 이 환경이 밖으로 못 나가서 생기는 소음. 코드 결함과 섞이지 않게 걸러 낸다.
   여기에 무엇을 넣었는지가 곧 "무엇을 안 셌는지"이므로 목록을 숨기지 않는다. */
const ENV_NOISE = [
  /supabase\.co/i,
  /Failed to load resource/i,
  /net::ERR_/i,
  /ERR_(CONNECTION|NAME|PROXY|NETWORK)/i,
  /Failed to fetch/i,
  /TypeError: Load failed/i,
  /oapi\.map\.naver\.com|nrbe\.pstatic\.net/i,
  /googletagmanager|google-analytics|doubleclick|adsbygoogle|pagead2/i,
  /the server responded with a status of 5\d\d/i,
  /* `/_vercel/insights/script.js` 는 Vercel 이 엣지에서 붙여 주는 경로다.
     로컬 `next start` 에는 그 경로가 없어 404 HTML 이 돌아오고, 브라우저가
     "MIME 이 text/html 이라 실행 거부"라고 찍는다. 코드 결함처럼 보이지만
     운영에서는 아니다 — 실측: `curl https://nuguzip.com/_vercel/insights/script.js`
     → 200 · application/javascript · 2,495B. 그래서 환경 소음으로 뺀다.
     빼는 근거를 여기 적어 두는 이유는, 근거 없이 뺀 항목은 다음 사람이
     "왜 안 세지?"라고 물을 때 아무도 답할 수 없기 때문이다. */
  /_vercel\/insights/i,
  /* 이 컨테이너에서 Supabase 로 나가면 프록시가 `Host not in allowlist` 를,
     서버 환경변수가 없으면 `서비스 클라이언트를 만들 수 없습니다` 를 돌려준다.
     그러면 앱이 "조회 실패"를 **일부러** 콘솔에 남긴다 — 사실 우선 원칙에 따라
     실패를 조용히 삼키지 않기로 한 그 로그다. 즉 이 줄들은 결함의 증거가
     아니라 결함 방지 장치가 작동한 증거다. 세는 대상에서 뺀다. */
  /Host not in allowlist/i,
  /서비스 클라이언트를 만들 수 없습니다/,
];

/* 개발 서버에만 존재하는 소음. 43번(key 경고)은 dev 로만 잴 수 있어서 dev 를
   돌려야 하는데, dev 는 운영에 없는 경고를 같이 낸다. 섞어 세면 "운영 콘솔이
   시끄럽다"는 틀린 기록이 남는다. */
const DEV_ONLY_NOISE = [/\[Fast Refresh\]/i, /Download the React DevTools/i];

const isEnvNoise = (text) => ENV_NOISE.some((re) => re.test(text)) || DEV_ONLY_NOISE.some((re) => re.test(text));

/* React key 경고의 실제 문구(개발 빌드). 문구가 바뀌면 여기도 같이 틀리므로
   43번은 "이 패턴으로 0건"이라고 범위를 적어 남긴다. */
const KEY_WARNING = /unique "key" prop|Each child in a list|Encountered two children with the same key/i;

async function detectReactMode(page) {
  /* 개발 서버는 청크 파일명을 해시 없이 내보낸다(main-app.js). 프로덕션은
     내용 해시가 붙는다(main-app-<hash>.js). 이걸로 못 가르면 "불명"으로 둔다 —
     모드를 잘못 적으면 43번 결론 전체가 틀린 안내가 된다. */
  return page.evaluate(() => {
    const srcs = Array.from(document.querySelectorAll("script[src]")).map((s) => s.getAttribute("src") ?? "");
    const dev = srcs.some((s) => /\/_next\/static\/chunks\/(main-app|app-pages-internals)\.js/.test(s));
    const prod = srcs.some((s) => /\/_next\/static\/chunks\/main-app-[0-9a-f]{8,}\.js/.test(s));
    if (dev && !prod) return "dev";
    if (prod && !dev) return "prod";
    return srcs.length === 0 ? "불명(스크립트 태그 없음)" : "불명";
  });
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  let reactMode = "불명";
  const codeIssues = [];
  const envIssues = [];
  const keyIssues = [];

  for (const route of ROUTES) {
    const bucket = [];
    const onConsole = (msg) => {
      const t = msg.type();
      if (t !== "error" && t !== "warning") return;
      bucket.push({ kind: t, text: msg.text().replace(/\s+/g, " ").slice(0, 500) });
    };
    const onPageError = (err) => {
      bucket.push({ kind: "pageerror", text: String(err?.message ?? err).replace(/\s+/g, " ").slice(0, 500) });
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      /* 하이드레이션 경고는 첫 페인트가 아니라 그 직후에 뜬다. 너무 일찍 끊으면
         "0건"이 나오는데, 그건 없는 게 아니라 아직 안 뜬 것이다. */
      await page.waitForTimeout(3500);
    } catch (e) {
      bucket.push({ kind: "goto", text: String(e?.message ?? e).slice(0, 200) });
    }

    if (reactMode === "불명") reactMode = await detectReactMode(page).catch(() => "불명");

    page.off("console", onConsole);
    page.off("pageerror", onPageError);

    const code = [];
    for (const m of bucket) {
      if (KEY_WARNING.test(m.text)) keyIssues.push({ route, ...m });
      if (isEnvNoise(m.text)) envIssues.push({ route, ...m });
      else code.push(m);
    }
    codeIssues.push(...code.map((m) => ({ route, ...m })));

    const mark = code.length === 0 ? "PASS" : "FAIL";
    console.log(
      `${mark} ${route} — 코드 원인 ${code.length}건 (환경 소음 ${bucket.length - code.length}건 제외)`,
    );
    for (const m of code) console.log(`   [${m.kind}] ${m.text}`);
  }

  await browser.close();

  console.log(`\nReact 빌드 판정: ${reactMode}`);
  console.log(`경로 ${ROUTES.length}개 · 코드 원인 ${codeIssues.length}건 · 환경 소음 ${envIssues.length}건`);
  if (reactMode === "dev") {
    console.log(`React key 경고: ${keyIssues.length}건 (개발 빌드이므로 이 수치는 유효)`);
    for (const k of keyIssues) console.log(`   ${k.route}: ${k.text}`);
  } else {
    console.log(
      "React key 경고: 이 서버로는 판정 불가 — 프로덕션 빌드에는 key 검사가 없다. " +
        "43번은 dev 서버(next dev)를 상대로 다시 재야 한다.",
    );
  }
  console.log(
    "주의: Supabase·지도 SDK·광고/분석 도메인은 이 컨테이너에서 막혀 있다. " +
      "그쪽 실패로만 발생하는 경고는 위 '환경 소음'으로 빠졌고, 운영에서 같은 " +
      "경로가 조용하다는 뜻은 아니다.",
  );
  process.exit(codeIssues.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
