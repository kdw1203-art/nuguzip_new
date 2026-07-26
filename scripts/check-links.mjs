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
const seen = new Map(); const broken = [];
async function check(path, from) {
  if (seen.has(path)) return seen.get(path);
  const res = await fetch(BASE + path, { redirect: 'manual' }).catch(() => null);
  const code = res ? res.status : 0;
  seen.set(path, code);
  return code;
}
const linkSources = new Map();
for (const s of seeds) {
  const res = await fetch(BASE + s).catch(() => null);
  if (!res || res.status !== 200) { broken.push([s, res ? res.status : 0, '(seed)']); continue; }
  const html = await res.text();
  const hrefs = [...html.matchAll(/href="(\/[^"#?]*)/g)].map(m => m[1]).filter(h => !h.startsWith('/_next') && !h.startsWith('/api'));
  for (const h of new Set(hrefs)) { if (!linkSources.has(h)) linkSources.set(h, s); }
}
for (const [h, from] of linkSources) {
  const code = await check(h, from);
  // 301: 레거시 경로 영구 이전(GET). 308: 메서드 보존 정규화. 307: 임시.
  if (code !== 200 && code !== 301 && code !== 307 && code !== 308) broken.push([h, code, from]);
}
console.log('총 검사 링크:', linkSources.size);
if (broken.length) {
  console.log('끊긴 경로:');
  broken.forEach(([p, c, f]) => console.log(`  ${c}  ${p}  (발견 위치: ${f})`));
  process.exit(1); // CI 게이트: 끊긴 링크 발견 시 배포 중단
} else console.log('끊긴 경로 0 ✓');
