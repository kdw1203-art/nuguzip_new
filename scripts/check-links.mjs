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

const linkSources = new Map();
for (const s of seeds) {
  const res = await get(s);
  if (!res) { recordNoResponse(s, '(seed)'); continue; }
  if (res.status !== 200) { broken.push([s, res.status, '(seed)']); continue; }
  const html = await res.text();
  const hrefs = [...html.matchAll(/href="(\/[^"#?]*)/g)].map(m => m[1]).filter(h => !h.startsWith('/_next') && !h.startsWith('/api'));
  for (const h of new Set(hrefs)) { if (!linkSources.has(h)) linkSources.set(h, s); }
}
for (const [h, from] of linkSources) {
  const code = await check(h, from);
  if (code === 0) { recordNoResponse(h, from); continue; }
  // 301: 레거시 경로 영구 이전(GET). 308: 메서드 보존 정규화. 307: 임시.
  if (code !== 200 && code !== 301 && code !== 307 && code !== 308) broken.push([h, code, from]);
}

console.log('총 검사 링크:', linkSources.size);

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

console.log(unverified.length ? '끊긴 경로 0 ✓ (확인 못 한 경로는 위에 있음)' : '끊긴 경로 0 ✓');
