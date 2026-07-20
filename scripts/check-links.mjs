// 연동 매트릭스 검증: 전 라우트 크롤 → 내부 링크 전수 검사 (미연결 0 = v1 조건)
const BASE = `http://localhost:${process.env.PORT || 3100}`;
const seeds = ['/', '/notes', '/notes/new', '/notes/mock-1', '/notes/compare', '/map', '/search', '/notifications', '/messages',
  '/analysis', '/analysis/compare', '/analysis/cycle', '/analysis/price', '/analysis/scenario', '/analysis/timing', '/analysis/portfolio', '/analysis/switch',
  '/town', '/town/news', '/town/news/mock-1', '/town/market', '/town/experts', '/town/groups', '/town/groups/mock-1',
  '/my', '/my/settings', '/my/assets', '/my/creator', '/subscription', '/login', '/signup', '/calculator', '/apply', '/support', '/safety', '/digest',
  '/admin', '/admin/moderation', '/admin/quality', '/admin/ops', '/admin/market', '/admin/revenue',
  '/seller', '/discover', '/complex/mock-1', '/u/mock-user',
  // 미들웨어 EXACT_REDIRECTS 키 전수 — 리다이렉트 타깃 404 회귀 방지 (감사 P0-4)
  '/register', '/mypage', '/my-page', '/map-home', '/map-price', '/map-analysis', '/map/price', '/map/analysis', '/region-comparison',
  '/terms', '/privacy', '/create-post', '/community/create', '/community/write', '/create-meeting', '/inspection/create-meeting', '/groups/create',
  '/create-meeting-market', '/create-product', '/market', '/market/create', '/market/product/101', '/meeting-market', '/content-market',
  '/report', '/reports', '/subscriptions', '/subscription-management', '/subscription-calendar', '/subscription-schedule', '/admin-dashboard',
  '/inspection-hub', '/inspection/hub', '/my-inspection', '/my-inspections', '/my-inspection-reports',
  '/inspection/create-report', '/inspection/my-reports', '/inspection/reports', '/inspection/my-schedule',
  '/info/public-data', '/comprehensive-calculator', '/investment-tools', '/calculator/acquisition', '/calculator/rent-vs-buy', '/calculator/tax', '/calculator/investment',
  '/compare-properties', '/property-comparison', '/apartment-comparison', '/properties', '/property-search', '/real-price',
  '/point-shop', '/expert', '/expert-matching', '/expert-verification', '/development-info', '/info/redevelopment',
  '/news', '/notice', '/events', '/price-prediction', '/ai-analysis/ai-prediction', '/supabase-guide', '/supabase-connect',
  '/community', '/ai-analysis', '/ai', '/auth/login', '/auth/signup', '/auth/register', '/auth/forgot-password', '/auth/reset-password',
  '/pricing', '/explore', '/experts', '/calculators', '/chat',
  '/upgrade', '/my/dashboard', '/library', '/post/123', '/community/456'];
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
