/**
 * G5 — 공개 라우트 캐시 정책.
 *
 * 배경: 미들웨어가 모든 문서 응답에 `Cache-Control: no-store` 를 덮어쓰고 있었다.
 * 보안상 안전한 기본값이지만, 그 결과 빌드 때 미리 만들어 둔(prerender) 공개 페이지까지
 * 매 요청 오리진을 때린다. ISR 로 이미 캐시해 둔 HTML 을 CDN 이 재사용하지 못하니
 * TTFB 가 그대로 손해다.
 *
 * ── 안전 근거 ──────────────────────────────────────────────
 * 아래 목록은 전부 **빌드 시점에 prerender 되는 라우트**다. 즉 로그인 여부와 무관하게
 * 서버가 같은 HTML 을 돌려준다(개인화는 클라이언트에서 붙는다 — 예: PersonalHome).
 * 같은 HTML 이므로 CDN 이 한 벌을 여러 사람에게 줘도 남의 정보가 새지 않는다.
 *
 * 이 전제가 깨지면 사고가 된다. 그래서 두 가지 안전장치를 둔다.
 *  1) scripts/check-cache-policy.mjs 가 빌드 산출물(.next/prerender-manifest.json)과
 *     이 목록을 대조해, prerender 되지 않는 경로가 목록에 있으면 CI 를 실패시킨다.
 *  2) 미들웨어는 응답에 쿠키(Supabase 세션 갱신 등)가 실려 있으면 캐시 헤더를 포기하고
 *     no-store 로 되돌린다 — 사용자별 상태가 실린 응답은 절대 공유 캐시에 넣지 않는다.
 *
 * 로그인·회원가입·알림함·내 정보처럼 "개인 것처럼 읽히는" 경로는 prerender 되더라도
 * 일부러 제외했다. 지금은 껍데기만 정적이어도, 나중에 서버 개인화가 붙기 쉬운 자리다.
 */

export type PublicCacheRule = {
  /** 정확히 일치하는 경로 */
  path: string;
  /** CDN 보관 시간(초) */
  sMaxAge: number;
  /** 만료 후에도 이 시간(초) 동안은 옛 응답을 주면서 뒤에서 갱신 */
  swr: number;
};

/** 빌드 시 고정되는 문서 — 내용이 거의 안 바뀐다 */
const STATIC_DOC = { sMaxAge: 3600, swr: 86400 };
/** 사용자 글·시세가 흘러가는 피드 — 라우트 자체 revalidate 와 비슷한 눈금 */
const FEED_DOC = { sMaxAge: 60, swr: 600 };

/* check-cache-policy.mjs 가 이 두 마커 사이를 읽는다 — 형식을 바꾸면 스크립트도 같이 고칠 것 */
/* PUBLIC_CACHE_RULES:start */
export const PUBLIC_CACHE_RULES: readonly PublicCacheRule[] = [
  // 콘텐츠 피드
  { path: "/", ...FEED_DOC },
  { path: "/town", ...FEED_DOC },
  { path: "/town/library", ...FEED_DOC },
  { path: "/town/market", ...FEED_DOC },
  /* /notes 는 ?mine=1(내 노트, 비공개 포함)로 세션별 응답이 갈리는 동적 라우트가 되어
     공개 캐시 목록에서 제외 — 사용자별 응답이 CDN 공유 캐시에 섞이면 안 된다. */
  { path: "/discover", ...FEED_DOC },
  { path: "/digest", ...FEED_DOC },
  /* A5 실거래 구간 인덱스 — 전 사용자 동일한 공개 집계(로그인 여부와 무관).
     라우트 자체가 revalidate 3600 이라 눈금을 맞춘다. */
  { path: "/tx", sMaxAge: 3600, swr: 86400 },

  // 도구·안내 — 빌드 시 고정
  { path: "/calculator", ...STATIC_DOC },
  { path: "/redevelopment", ...STATIC_DOC },
  { path: "/safety", ...STATIC_DOC },
  { path: "/methodology", ...STATIC_DOC },
  { path: "/glossary", ...STATIC_DOC },
  { path: "/reports", ...STATIC_DOC },
  { path: "/seller", ...STATIC_DOC },
  { path: "/partners", ...STATIC_DOC },
  { path: "/support", ...STATIC_DOC },
  { path: "/guides/contract", ...STATIC_DOC },
  { path: "/guides/regulations", ...STATIC_DOC },
  { path: "/analysis/compare", ...STATIC_DOC },
  { path: "/analysis/cycle", ...STATIC_DOC },
  { path: "/analysis/portfolio", ...STATIC_DOC },
  { path: "/analysis/price", ...STATIC_DOC },
  { path: "/analysis/scenario", ...STATIC_DOC },
  { path: "/analysis/switch", ...STATIC_DOC },

  // 약관·고지 — 가장 오래 캐시해도 되는 문서
  { path: "/legal", ...STATIC_DOC },
  { path: "/legal/community", ...STATIC_DOC },
  { path: "/legal/expert", ...STATIC_DOC },
  { path: "/legal/fees", ...STATIC_DOC },
  { path: "/legal/location", ...STATIC_DOC },
  { path: "/legal/privacy", ...STATIC_DOC },
  { path: "/legal/privacy-request", ...STATIC_DOC },
  { path: "/legal/terms", ...STATIC_DOC },
  { path: "/legal/youth", ...STATIC_DOC },
];
/* PUBLIC_CACHE_RULES:end */

const RULE_BY_PATH = new Map(PUBLIC_CACHE_RULES.map((r) => [r.path, r]));

/**
 * 크롤러용 기계 판독 엔드포인트 — 사람이 로그인해서 보는 문서가 아니다.
 *
 * 이 둘은 Accept 헤더에 text/html 이 섞여 오는 탓에 위 `isDocument` 분기를 타서
 * 매 요청 no-store + 세션·CSP 쿠키 + Clear-Site-Data 까지 받고 있었다. 크롤러는
 * 쿠키를 들고 오지 않으니 쿠키가 매번 새로 실렸고, 그래서 영영 캐시되지 않았다.
 *
 * 응답 내용은 공개 데이터만으로 만들어져 요청자와 무관하게 동일하다(sitemap 은
 * 실거래·공개노트, robots.ts 는 상수). 게다가 sitemap 은 5,000행짜리 집계 조회라
 * 크롤 때마다 오리진을 때릴 이유가 전혀 없다. 그래서 공유 캐시를 허용한다.
 *
 * 단, 응답에 쿠키가 실렸다면(로그인한 사람이 브라우저로 열어 세션이 갱신된 경우)
 * 미들웨어가 공개 캐시를 포기하고 no-store 로 되돌린다 — 공개 문서와 같은 규칙이다.
 */
const CRAWLER_ENDPOINTS = new Set(["/robots.txt", "/sitemap.xml"]);

export function isCrawlerEndpoint(pathname: string): boolean {
  return CRAWLER_ENDPOINTS.has(pathname);
}

/** 크롤러 엔드포인트 캐시 — 사이트맵 원본 데이터가 하루 단위로 바뀌므로 1시간이면 충분 */
export const CRAWLER_ENDPOINT_CACHE_CONTROL =
  "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

/**
 * 이 경로의 문서 응답에 붙일 Cache-Control. 목록에 없으면 null(= 기존대로 no-store).
 *
 * 브라우저 몫은 max-age=0 으로 둔다. 개인 기기 디스크에 HTML 을 남길 이유가 없고,
 * 우리가 얻으려는 건 CDN 공유 캐시(s-maxage)이기 때문이다.
 */
export function publicDocumentCacheControl(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const rule = RULE_BY_PATH.get(path || "/");
  if (!rule) return null;
  return `public, max-age=0, s-maxage=${rule.sMaxAge}, stale-while-revalidate=${rule.swr}`;
}
