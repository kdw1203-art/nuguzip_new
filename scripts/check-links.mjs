// 연동 매트릭스 검증: 전 라우트 크롤 → 내부 링크 전수 검사 (미연결 0 = v1 조건)
const BASE = `http://localhost:${process.env.PORT || 3100}`;
const seeds = ['/', '/notes', '/notes/new', '/notes/mock-1', '/notes/compare', '/map', '/search', '/notifications', '/messages',
  '/analysis', '/analysis/compare', '/analysis/cycle', '/analysis/price', '/analysis/scenario', '/analysis/timing', '/analysis/portfolio', '/analysis/switch',
  '/town', '/town/news', '/town/news/mock-1', '/town/market', '/town/experts', '/town/groups', '/town/groups/mock-1',
  '/my', '/my/settings', '/my/assets', '/my/dashboard', '/my/creator', '/subscription', '/login', '/signup', '/calculator', '/apply', '/support', '/safety', '/digest',
  '/admin', '/admin/moderation', '/admin/quality', '/admin/ops', '/admin/market', '/admin/revenue',
  '/library', '/seller', '/upgrade', '/discover', '/complex/mock-1', '/u/mock-user'];
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
  if (code !== 200 && code !== 307 && code !== 308) broken.push([h, code, from]);
}
console.log('총 검사 링크:', linkSources.size);
if (broken.length) {
  console.log('끊긴 경로:');
  broken.forEach(([p, c, f]) => console.log(`  ${c}  ${p}  (발견 위치: ${f})`));
  process.exit(1); // CI 게이트: 끊긴 링크 발견 시 배포 중단
} else console.log('끊긴 경로 0 ✓');
