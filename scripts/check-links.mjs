// 연동 매트릭스 검증: 전 라우트 크롤 → 내부 링크 전수 검사 (미연결 0 = v1 조건)
/* N6 — 레거시 경로 시드는 lib/seo/redirect-map.ts 에서 직접 가져온다.
   전에는 83개를 여기에 손으로 베껴 뒀는데, 표에서 한 줄이 빠져도 여기는 그대로라
   이미 없는 규칙을 계속 찔러 보고 있었다(그리고 표에 새로 넣은 /billing/success 는
   여기 없어서 한 번도 검사되지 않았다). 한 곳만 고치면 되게 바꾼다. */
let EXACT_REDIRECTS;
try {
  // .ts 직접 import — Node 22.18+ 의 타입 스트리핑에 기댄다.
  // redirect-map.ts 는 의존성이 하나도 없어서 이게 가능하다.
  ({ EXACT_REDIRECTS } = await import("../lib/seo/redirect-map.ts"));
} catch (err) {
  console.error(
    `리다이렉트 맵을 읽지 못했습니다 — ${err.message}\n` +
      `  현재 Node: ${process.version} · 필요: v22.18 이상(.ts 타입 스트리핑 기본 활성)`,
  );
  process.exit(1);
}

const BASE = `http://localhost:${process.env.PORT || 3100}`;

/* ── 응답을 못 받았을 때를 어떻게 다룰 것인가 ───────────────────────────────
 *
 * 2026-07-26 오전: 상한이 아예 없어서, DB 가 느려지자 동적 라우트 하나가 응답을
 * 영원히 붙잡았고 순차 크롤이라 배포 실행 전체가 3시간을 멈춰 있었다.
 * 그래서 요청당 20초 상한을 넣고, 타임아웃을 "끊긴 링크"와 함께 배포 중단으로 처리했다.
 *
 * 그런데 그게 같은 날 오후에 정반대 방향으로 고장 났다. DB 가 계속 느린 상태라
 * 200개 경로 중 하나만 20초를 넘겨도 배포가 막혔고, **그 느림을 고치는 커밋들이
 * 바로 그 이유로 배포되지 못했다.** 스스로 문을 잠근 셈이다.
 *
 * 그래서 사실을 세 갈래로 나눠 다룬다. 뭉뚱그리면 둘 중 하나가 반드시 틀린다:
 *
 *   1. 끊긴 링크 (4xx/5xx)  — **사이트에 대한 사실**. 지금도 배포를 막는다.
 *   2. 응답 없음 (타임아웃) — **그 순간에 대한 사실**. 사이트가 틀렸다는 증거가
 *      아니다. 한 번 더 늘려 잡아 보고, 그래도 안 되면 로그에 크게 남기되
 *      소수라면 배포는 통과시킨다.
 *   3. 응답 없음이 임계치를 넘음 — 이건 다시 **사이트에 대한 사실**이다.
 *      한둘이 느린 것과 전부가 안 뜨는 것은 다른 상태다. 그때는 배포를 막는다.
 *
 * 절대 하지 않는 것: 타임아웃을 200 처럼 조용히 넘기기. 못 받은 응답은
 * 200 도 404 도 아니고, 로그에 반드시 "응답없음"으로 남는다.
 */
/* ── 5xx 를 어떻게 다룰 것인가 (같은 문이 또 잠겼다) ────────────────────────
 *
 * 위의 세 갈래는 "응답을 못 받았을 때"의 이야기였다. 그런데 그 다음 날,
 * 정확히 같은 자물쇠가 이번엔 **응답을 받았는데도** 채워졌다.
 *
 * 우리는 의도적으로 `/region/[id]` 같은 페이지가 핵심 조회에 실패하면 500 을
 * 내도록 고쳤다. 크롤러에게 404("영구히 없음")가 아니라 5xx("나중에 다시 와라")
 * 라고 말하는 게 사실이기 때문이다. 그런데 이 게이트는 4xx 와 5xx 를 똑같이
 * "끊긴 링크"로 세고 있었다. 그래서 DB 가 내려가 있는 동안에는,
 * **DB 장애 내성을 고치는 커밋이 바로 그 DB 장애 때문에 배포되지 못한다.**
 *
 * 그래서 둘을 갈라 놓는다:
 *
 *   4xx — **링크 그래프에 대한 사실**. DB 상태와 무관하다(없는 경로는 DB 가
 *         멀쩡해도 없다). 지금도 그대로 배포를 막는다.
 *   5xx — 조건부다. `/api/health` 로 DB 도달 가능 여부를 **측정해서**,
 *         DB 가 내려가 있으면 그 5xx 는 설계대로 동작한 결과이지 회귀가
 *         아니다. 로그에 크게 남기되 배포는 통과시킨다.
 *         DB 가 멀쩡한데 5xx 면 그건 진짜 회귀다 — 막는다.
 *
 * 추측하지 않는다. `checks.db.ok` 를 실제로 읽고, 그 값을 로그에 적는다.
 */
const HEALTH_PATH = "/api/health";
const HEALTH_TIMEOUT_MS = 15_000;

const REQ_TIMEOUT_MS = 20_000;
const RETRY_TIMEOUT_MS = 30_000;
/* 재시도 총량 상한 — 없으면 전면 장애 때 크롤이 (경로수 × 50초)로 늘어나
   스텝 상한(12분)에 부딪혀 "왜 죽었는지 모르는 실패"로 되돌아간다. */
const MAX_RETRIES = 10;
/* 이걸 넘으면 "느린 순간"이 아니라 "안 뜨는 사이트"로 본다. */
const MAX_UNVERIFIED = Number.isFinite(Number(process.env.LINK_CHECK_MAX_UNVERIFIED))
  ? Number(process.env.LINK_CHECK_MAX_UNVERIFIED)
  : 5;

let retriesUsed = 0;
/** path → 'timeout' | 'error'  (응답을 못 받은 경로만 기록) */
const noResponse = new Map();

async function fetchOnce(path, init, ms) {
  try {
    return { res: await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(ms) }) };
  } catch (err) {
    return { res: null, timeout: err?.name === "TimeoutError", why: err?.message || String(err) };
  }
}

async function get(path, init) {
  let out = await fetchOnce(path, init, REQ_TIMEOUT_MS);

  /* 첫 요청은 그 라우트의 첫 렌더라 캐시가 비어 있다. 한 번 더 주는 것은
     봐주기가 아니라, 콜드 스타트와 진짜 장애를 구분하기 위한 관측이다. */
  if (!out.res && out.timeout && retriesUsed < MAX_RETRIES) {
    retriesUsed += 1;
    console.log(
      `  … ${path} — ${REQ_TIMEOUT_MS / 1000}초 안에 응답 없음. ` +
        `${RETRY_TIMEOUT_MS / 1000}초로 한 번 더 (재시도 ${retriesUsed}/${MAX_RETRIES})`,
    );
    out = await fetchOnce(path, init, RETRY_TIMEOUT_MS);
  }

  if (!out.res) {
    if (out.timeout) {
      noResponse.set(path, "timeout");
      console.log(`  ! ${path} — 응답 없음(재시도 후에도 ${RETRY_TIMEOUT_MS / 1000}초 초과)`);
    } else {
      noResponse.set(path, "error");
      console.log(`  ! ${path} — 요청 실패: ${out.why}`);
    }
  }
  return out.res;
}

const seeds = ['/', '/notes', '/notes/new', '/notes/mock-1', '/notes/compare', '/map', '/search', '/notifications', '/messages',
  '/analysis', '/analysis/compare', '/analysis/cycle', '/analysis/price', '/analysis/scenario', '/analysis/timing', '/analysis/portfolio', '/analysis/switch',
  '/town', '/town/news', '/town/market', '/town/experts', '/town/groups', '/town/groups/mock-1',
  '/my', '/my/settings', '/my/assets', '/my/creator', '/subscription', '/login', '/signup', '/calculator', '/apply', '/support', '/safety', '/digest',
  '/admin', '/admin/moderation', '/admin/quality', '/admin/ops', '/admin/market', '/admin/revenue',
  // 사실 우선(facts-first): 존재하지 않는 단지/글/핸들은 목업 대신 404가 정상.
  // /complex/mock-1, /town/news/mock-1, /u/[handle] 은 의도된 404이므로 시드에서 제외.
  '/seller', '/discover',
  // 미들웨어 리다이렉트 키 전수 — 리다이렉트 타깃 404 회귀 방지 (감사 P0-4 · N6)
  ...Object.keys(EXACT_REDIRECTS),
  // 구 게시글 경로 패턴(/post/:id, /community/:id) — 표가 아니라 정규식으로 처리되는 분기
  '/post/123', '/community/456'];

const seen = new Map();
const broken = [];
const unverified = [];
/** 5xx 를 받은 경로 — DB 상태를 확인한 뒤에 끊긴 링크인지 아닌지 판정한다. */
const serverErrors = [];

/**
 * DB 에 지금 닿는가를 **측정한다**. 추측하지 않는다.
 *
 * `/api/health` 는 인증 없이 `checks.db.ok`(boolean)를 주고 `no-store` 라
 * 캐시된 옛날 사실을 읽을 위험도 없다.
 *
 * @returns {Promise<{ok: boolean|null, why: string}>}
 *   ok=true  DB 도달 가능 · ok=false 도달 불가 · ok=null 판정 불가(헬스체크 자체 실패)
 */
async function probeDb() {
  const out = await fetchOnce(HEALTH_PATH, {}, HEALTH_TIMEOUT_MS);
  if (!out.res) return { ok: null, why: out.timeout ? "헬스체크 응답 없음" : `헬스체크 요청 실패: ${out.why}` };
  if (!out.res.ok) return { ok: null, why: `헬스체크 HTTP ${out.res.status}` };
  try {
    const body = await out.res.json();
    const dbOk = body?.checks?.db?.ok;
    if (typeof dbOk !== "boolean") return { ok: null, why: "헬스체크 응답에 checks.db.ok 가 없음" };
    return { ok: dbOk, why: dbOk ? "checks.db.ok = true" : "checks.db.ok = false" };
  } catch (err) {
    return { ok: null, why: `헬스체크 본문 파싱 실패: ${err.message}` };
  }
}

/** 200/리다이렉트가 아닌 응답을 분류한다 — 4xx 는 즉시 끊긴 링크, 5xx 는 보류. */
function recordBadStatus(path, code, from) {
  if (code >= 500) serverErrors.push([path, code, from]);
  else broken.push([path, code, from]);
}

/** 응답을 못 받은 경로를 어느 목록에 넣을지 — 요청 실패(연결 거부 등)는 사이트 문제다. */
function recordNoResponse(path, from) {
  if (noResponse.get(path) === "error") broken.push([path, 0, from]);
  else unverified.push([path, from]);
}

async function check(path, from) {
  if (seen.has(path)) return seen.get(path);
  const res = await get(path, { redirect: 'manual' });
  const code = res ? res.status : 0;
  seen.set(path, code);
  return code;
}

/* 크롤 전에 DB 상태를 한 번 찍어 둔다. 크롤 중에 내려갈 수도 있으니 이건
   확정 판정이 아니라 기록이다 — 최종 판정은 5xx 가 실제로 나왔을 때 다시 잰다. */
const dbBefore = await probeDb();
console.log(
  `DB 도달 여부(크롤 시작 시점): ${
    dbBefore.ok === true ? "정상" : dbBefore.ok === false ? "불가" : "판정 불가"
  } — ${dbBefore.why}`,
);

const linkSources = new Map();
for (const s of seeds) {
  const res = await get(s);
  if (!res) { recordNoResponse(s, '(seed)'); continue; }
  if (res.status !== 200) { recordBadStatus(s, res.status, '(seed)'); continue; }
  const html = await res.text();
  const hrefs = [...html.matchAll(/href="(\/[^"#?]*)/g)].map(m => m[1]).filter(h => !h.startsWith('/_next') && !h.startsWith('/api'));
  for (const h of new Set(hrefs)) { if (!linkSources.has(h)) linkSources.set(h, s); }
}
for (const [h, from] of linkSources) {
  const code = await check(h, from);
  if (code === 0) { recordNoResponse(h, from); continue; }
  // 301: 레거시 경로 영구 이전(GET). 308: 메서드 보존 정규화. 307: 임시.
  if (code !== 200 && code !== 301 && code !== 307 && code !== 308) recordBadStatus(h, code, from);
}

console.log('총 검사 링크:', linkSources.size);

/* 5xx 판정 — 여기서만 DB 상태를 근거로 쓴다.
   크롤이 몇 분 걸리므로 시작 시점 값만 믿지 않고 끝에서 한 번 더 잰다. */
if (serverErrors.length) {
  const dbAfter = dbBefore.ok === false ? dbBefore : await probeDb();
  /* 배포를 막는 건 "회귀다"라고 **주장**하는 일이다. 그 주장은 근거가 있을 때만
     한다 — 크롤 전후 모두 DB 가 정상이었음을 실제로 확인했을 때만.
     판정 불가(헬스체크 자체 실패)는 근거가 아니다. 그때는 막지 않고 크게 적는다. */
  const dbProvenHealthy = dbBefore.ok === true && dbAfter.ok === true;

  console.log(`\n서버 오류(5xx)를 받은 경로 ${serverErrors.length}개:`);
  serverErrors.forEach(([p, c, f]) => console.log(`  ${c}  ${p}  (발견 위치: ${f})`));
  console.log(
    `  DB 도달 여부(크롤 종료 시점): ${
      dbAfter.ok === true ? "정상" : dbAfter.ok === false ? "불가" : "판정 불가"
    } — ${dbAfter.why}`,
  );

  if (dbProvenHealthy) {
    console.log(
      `  → DB 는 정상인데 5xx 입니다. 이건 진짜 회귀입니다 — 배포를 막습니다.`,
    );
    serverErrors.forEach((e) => broken.push(e));
  } else {
    /* DB 에 닿지 못하면 이 5xx 는 설계대로 나온 응답이다.
       (핵심 조회 실패를 404 로 위장하지 않고 5xx 로 내는 것이 우리 규칙이다.)
       회귀가 아니므로 배포를 막지 않는다 — 막으면 DB 장애를 고치는 커밋이
       바로 그 장애 때문에 못 나간다. 다만 절대 "정상"으로 세지 않는다. */
    console.log(
      `  → DB 가 정상이라고 확인하지 못했습니다. 위 5xx 는 "핵심 조회 실패는 404 가\n` +
        `    아니라 5xx" 규칙대로 동작한 결과일 수 있고, 링크 회귀라는 증거는 없습니다.\n` +
        `    배포는 막지 않되 이 경로들을 "정상 확인됨"으로 세지 않았습니다.`,
    );
  }
}

/* 응답을 못 받은 경로는 통과시키든 막든 **항상** 적는다.
   조용히 넘어가면 다음 사람이 "전부 200 이었다"고 잘못 읽는다. */
if (unverified.length) {
  console.log(`\n확인하지 못한 경로 ${unverified.length}개 (응답없음 — 200 도 404 도 아님):`);
  unverified.forEach(([p, f]) => console.log(`  응답없음  ${p}  (발견 위치: ${f})`));
  console.log(
    `  → 이 경로들은 "정상"으로 세지 않았습니다. 서버가 느렸다는 뜻이고,\n` +
      `    사이트가 틀렸다는 증거는 아닙니다. 임계치 ${MAX_UNVERIFIED}개까지는 배포를 막지 않습니다.`,
  );
}

if (broken.length) {
  console.log('\n끊긴 경로:');
  // 코드 0 은 "404 를 받았다"가 아니라 "요청 자체가 실패했다"는 뜻이다.
  // 이 둘을 같은 줄로 적으면 로그를 보고 원인을 잘못 짚게 된다.
  broken.forEach(([p, c, f]) =>
    console.log(`  ${c === 0 ? '요청실패' : c}  ${p}  (발견 위치: ${f})`),
  );
  process.exit(1); // CI 게이트: 끊긴 링크 발견 시 배포 중단
}

if (unverified.length > MAX_UNVERIFIED) {
  console.log(
    `\n확인하지 못한 경로가 ${unverified.length}개로 임계치(${MAX_UNVERIFIED})를 넘었습니다.\n` +
      `  한둘이 느린 것과 전부가 안 뜨는 것은 다른 상태입니다 — 이건 후자로 봅니다.\n` +
      `  (임계치는 LINK_CHECK_MAX_UNVERIFIED 로 조정할 수 있습니다.)`,
  );
  process.exit(1);
}

if (retriesUsed >= MAX_RETRIES) {
  console.log(`\n(참고) 재시도 상한 ${MAX_RETRIES}회를 다 썼습니다 — 그 뒤 타임아웃은 재시도 없이 기록만 했습니다.`);
}

const caveats = [
  unverified.length ? `응답없음 ${unverified.length}개` : null,
  serverErrors.length ? `5xx ${serverErrors.length}개(DB 미확인)` : null,
].filter(Boolean);
console.log(
  caveats.length
    ? `끊긴 경로 0 ✓ (다만 ${caveats.join(" · ")} — 위 로그 참고)`
    : "끊긴 경로 0 ✓",
);
