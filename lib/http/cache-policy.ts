import { SITEMAP_PATHS } from "@/lib/seo/sitemap-slugs";

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

/**
 * 동적 공개 라우트용 규칙 — 위 정확일치 목록으로는 닿지 않는 자리를 덮는다.
 *
 * ── 왜 필요했나 (2026-07-28, 운영 사고) ─────────────────────────
 * 사이트맵에 실린 URL 27,427개 중 25,310개가 `/complex/[id]` 다. 그런데 이 라우트는
 * 값이 주소에서 오는 동적 라우트라 정확일치 목록에 올릴 수가 없었고, 목록에 없으니
 * publicDocumentCacheControl 이 null 을 돌려주고, 미들웨어가 `no-store` 로 덮었다.
 * 결과: 구글·네이버가 그 27,427개를 크롤할 때마다 CDN 을 건너뛰고 오리진 함수를
 * 호출했다. 운영 응답 헤더로 실측 확인 —
 *   `/`                → x-nextjs-prerender: 1 · x-vercel-cache: STALE
 *   `/complex/{id}`    → cache-control: private, no-cache, no-store · x-vercel-cache: MISS · age: 0
 * Vercel 무료 티어 함수 호출 100만 회가 이렇게 소진됐다.
 *
 * ── 정정 (같은 날, 배포 후 실측) ────────────────────────────────
 * 위 진단은 절반만 맞았다. 이 목록만 채우고 배포한 뒤 운영에서 다시 재 보니
 * `/complex/{id}` 는 여전히 `private, no-cache, no-store` · x-vercel-cache: MISS
 * 였다. 진짜 이유는 따로 있었다: 그 라우트들은 동적 세그먼트에
 * generateStaticParams 가 없어서 Next 가 "요청마다 서버 렌더"로 분류하고 있었고
 * (.next/prerender-manifest.json 의 dynamicRoutes 에 `/glossary/[term]` 하나뿐),
 * 그렇게 분류된 응답에는 Next 가 직접 `private, no-cache, no-store` 를 실어
 * 보내기 때문에 미들웨어가 앞서 붙인 헤더가 그 값에 덮인다. 헤더를 고쳐도
 * 라우트 분류를 안 바꾸면 아무 일도 일어나지 않는다는 뜻이다.
 * 그래서 각 page.tsx 에 빈 배열을 돌려주는 generateStaticParams 를 넣어 ISR 로
 * 옮겼고, 라우트가 실제로 프리렌더/ISR 중 하나로 잡혔는지를
 * scripts/check-cache-policy.mjs 가 빌드 산출물에서 확인한다.
 * 아래 목록은 그래도 남긴다 — 프리렌더/ISR 로 잡히지 않는 자리(정적 공개 문서,
 * 예외 라우트)에서는 이 헤더가 실제로 응답에 남기 때문이다.
 *
 * ── 안전 근거 ──────────────────────────────────────────────
 * 정확일치 목록의 근거는 "빌드 때 prerender 됐으니 모두에게 같은 HTML"이었다.
 * 동적 라우트에는 그 근거를 쓸 수 없으므로, 대신 더 직접적인 근거를 쓴다:
 * **이 라우트들의 서버 렌더에는 사용자별 상태가 전혀 들어가지 않는다.**
 * page.tsx 와 같은 폴더의 서버 컴포넌트 어디에도 getUser·getSession·cookies()·
 * createServerClient 가 없다(개인화는 전부 클라이언트에서 붙는다). 공유 캐시가
 * 한 벌을 여러 사람에게 줘도 남의 정보가 섞일 자리가 없다.
 *
 * 이 전제도 사람 말로만 두면 썩는다. 그래서 scripts/check-cache-policy.mjs 가
 * 아래 목록의 route 마다 실제 소스를 열어 그 표식들을 찾고, 하나라도 있으면 CI 를
 * 실패시킨다. 정확일치 목록을 prerender 매니페스트와 대조하는 것과 같은 급의 검사다.
 * 미들웨어의 쿠키 안전장치(응답에 Set-Cookie 가 있으면 no-store)도 그대로 걸려 있다.
 *
 * `/notes/[id]` 는 일부러 뺐다 — force-dynamic 이고 작성자에게만 보이는 부분이 있다.
 */
export type PublicCachePatternRule = {
  /** Next 라우트 표기. 게이트가 이 값으로 app/<route>/page.tsx 를 찾아 검사한다 */
  route: string;
  /** 요청 경로 매칭 — 반드시 앵커(^…$)를 걸 것 */
  test: RegExp;
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
  /* `/town/market` 은 공개 캐시 목록에서 뺐다(2026-07-27). 화면이 아니라
     `/town/groups` 로 넘기는 리다이렉트 스텁이고, searchParams 를 읽어 쿼리를
     그대로 넘기느라 동적 라우트다 — prerender 산출물이 없어 이 목록에 남아
     있으면 check-cache-policy 가 실패한다. 캐시할 응답 자체가 없다. */
  /* /notes 는 ?mine=1(내 노트, 비공개 포함)로 세션별 응답이 갈리는 동적 라우트가 되어
     공개 캐시 목록에서 제외 — 사용자별 응답이 CDN 공유 캐시에 섞이면 안 된다. */
  { path: "/discover", ...FEED_DOC },
  { path: "/digest", ...FEED_DOC },
  /* A5 실거래 구간 인덱스 — 전 사용자 동일한 공개 집계(로그인 여부와 무관).
     라우트 자체가 revalidate 3600 이라 눈금을 맞춘다. */
  { path: "/tx", sMaxAge: 3600, swr: 86400 },
  /* N10 단지 비교 허브 — 같은 성격의 공개 집계. 라우트 revalidate 와 눈금을 맞춘다. */
  { path: "/complex/compare", sMaxAge: 3600, swr: 86400 },
  /* N11 시장 온도 주간 기록 허브 — 크론이 하루 두 번 갱신하므로 같은 눈금(1시간)이면
     충분하다. 지역별 상세는 동적 라우트라 여기 대상이 아니다(프리렌더 매니페스트에
     없으면 check-cache-policy 가 실패한다). */
  { path: "/analysis/temperature", sMaxAge: 3600, swr: 86400 },

  // 도구·안내 — 빌드 시 고정
  { path: "/calculator", ...STATIC_DOC },
  { path: "/widget", ...STATIC_DOC },
  { path: "/redevelopment", ...STATIC_DOC },
  { path: "/safety", ...STATIC_DOC },
  { path: "/methodology", ...STATIC_DOC },
  { path: "/glossary", ...STATIC_DOC },
  { path: "/developers", ...STATIC_DOC },
  { path: "/reports", ...STATIC_DOC },
  { path: "/about", ...STATIC_DOC },
  { path: "/seller", ...STATIC_DOC },
  { path: "/partners", ...STATIC_DOC },
  { path: "/support", ...STATIC_DOC },
  { path: "/support/faq", ...STATIC_DOC },
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

/* check-cache-policy.mjs 가 이 두 마커 사이도 읽는다 — 형식을 바꾸면 스크립트도 같이 고칠 것 */
/* PUBLIC_CACHE_PATTERNS:start */
export const PUBLIC_CACHE_PATTERN_RULES: readonly PublicCachePatternRule[] = [
  /* `/complex/browse` 는 `[id]` 패턴에 가려지는 실제 페이지다(정적 경로지만 이번
     빌드에서 prerender 되지 않아 정확일치 목록에는 올릴 수 없다). 가려진 채로 두면
     게이트가 그 페이지의 개인화 여부를 한 번도 확인하지 않게 되므로, 앞자리에
     제 이름으로 올려 검사 대상에 넣는다. 아래 `/digest/archive` 도 같은 이유다. */
  { route: "/complex/browse", test: /^\/complex\/browse$/, sMaxAge: 3600, swr: 86400 },
  /* 프로그래매틱 SEO 의 몸통 — 사이트맵 27,427개 중 25,310개가 여기다.
     라우트 자체는 revalidate 120 이지만 CDN 눈금은 일부러 더 길게 잡는다.
     둘은 재는 대상이 다르다: revalidate 는 "오리진이 들고 있는 사본이 얼마나
     신선한가"이고, s-maxage 는 "같은 주소 하나에 오리진 렌더를 얼마나 자주
     치를 것인가"다. 호출 수를 줄이는 건 뒤쪽 눈금이다 — swr 을 아무리 늘려도
     재검증은 s-maxage 창마다 한 번씩 돌기 때문이다.
     1시간으로 잡은 이유: 시세 원본은 국토부 실거래라 하루 단위로 들어오지만
     이 화면에는 임장노트·Q&A·매물처럼 사람이 실시간으로 쓰는 것도 같이 있다.
     하루를 통째로 묵히면 방금 달린 답이 하루 동안 안 보인다. 1시간이면 그
     손해는 감당할 만하면서, 크롤러가 같은 주소를 하루에 몇 번씩 긁어도 오리진
     호출은 시간당 한 번으로 접힌다. */
  { route: "/complex/[id]", test: /^\/complex\/[^/]+$/, sMaxAge: 3600, swr: 86400 },
  /* 아래는 전부 라우트 revalidate 3600 과 눈금을 맞춘다. */
  {
    route: "/complex/compare/[slug]",
    test: /^\/complex\/compare\/[^/]+$/,
    sMaxAge: 3600,
    swr: 86400,
  },
  { route: "/complex/tx/[slug]", test: /^\/complex\/tx\/[^/]+$/, sMaxAge: 3600, swr: 86400 },
  { route: "/region/[id]", test: /^\/region\/[^/]+$/, sMaxAge: 3600, swr: 86400 },
  { route: "/tx/[region]", test: /^\/tx\/[^/]+$/, sMaxAge: 3600, swr: 86400 },
  {
    route: "/tx/[region]/[kind]/[band]",
    test: /^\/tx\/[^/]+\/[^/]+\/[^/]+$/,
    sMaxAge: 3600,
    swr: 86400,
  },
  { route: "/reports/[ym]", test: /^\/reports\/[^/]+$/, sMaxAge: 3600, swr: 86400 },
  {
    route: "/reports/season/[slug]",
    test: /^\/reports\/season\/[^/]+$/,
    sMaxAge: 3600,
    swr: 86400,
  },
  {
    route: "/analysis/temperature/[region]",
    test: /^\/analysis\/temperature\/[^/]+$/,
    sMaxAge: 3600,
    swr: 86400,
  },
  { route: "/digest/archive", test: /^\/digest\/archive$/, sMaxAge: 3600, swr: 86400 },
  { route: "/digest/[week]", test: /^\/digest\/[^/]+$/, sMaxAge: 3600, swr: 86400 },
  /* 용어 개별 페이지는 코드 상수라 조회조차 없다 — 가장 오래 캐시해도 되는 축. */
  { route: "/glossary/[term]", test: /^\/glossary\/[^/]+$/, sMaxAge: 3600, swr: 86400 },
];
/* PUBLIC_CACHE_PATTERNS:end */

const RULE_BY_PATH = new Map(PUBLIC_CACHE_RULES.map((r) => [r.path, r]));

/**
 * 크롤러용 기계 판독 엔드포인트 — 사람이 로그인해서 보는 문서가 아니다.
 *
 * 이들은 Accept 헤더에 text/html 이 섞여 오는 탓에 위 `isDocument` 분기를 타서
 * 매 요청 no-store + 세션·CSP 쿠키 + Clear-Site-Data 까지 받고 있었다. 크롤러는
 * 쿠키를 들고 오지 않으니 쿠키가 매번 새로 실렸고, 그래서 영영 캐시되지 않았다.
 *
 * 응답 내용은 공개 데이터만으로 만들어져 요청자와 무관하게 동일하다(sitemap 은
 * 실거래·공개노트, robots.ts 는 상수). 게다가 sitemap 은 5,000행짜리 집계 조회라
 * 크롤 때마다 오리진을 때릴 이유가 전혀 없다. 그래서 공유 캐시를 허용한다.
 *
 * feed.xml(N3 RSS)이 뒤늦게 합류한 이유: 라우트 자체는 Cache-Control 을 싣고
 * 있었지만 여기 없어서 미들웨어의 문서 분기가 그 값을 no-store 로 덮고 있었다.
 * 성격은 sitemap 과 같다(공개 데이터만, 요청자 무관, 매번 DB 조회).
 *
 * 단, 응답에 쿠키가 실렸다면(로그인한 사람이 브라우저로 열어 세션이 갱신된 경우)
 * 미들웨어가 공개 캐시를 포기하고 no-store 로 되돌린다 — 공개 문서와 같은 규칙이다.
 */
const CRAWLER_ENDPOINTS = new Set([
  "/robots.txt",
  "/feed.xml",
  // N4 — 사이트맵 인덱스 + 유형별 자식 전부. 목록은 sitemap-slugs.ts 한 곳에만 둔다
  // (그 모듈은 상수뿐이라 Edge 미들웨어가 DB 로더를 딸려 들고 가지 않는다).
  ...SITEMAP_PATHS,
]);

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
  const path = (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname) || "/";
  /* 정확일치가 먼저다 — `/complex/compare` 처럼 패턴과 겹치는 자리는 목록에 적힌
     값이 이긴다. 뒤에 붙는 패턴은 목록이 닿지 못하는 동적 라우트만 줍는다. */
  const rule = RULE_BY_PATH.get(path) ?? PUBLIC_CACHE_PATTERN_RULES.find((r) => r.test.test(path));
  if (!rule) return null;
  return `public, max-age=0, s-maxage=${rule.sMaxAge}, stale-while-revalidate=${rule.swr}`;
}
