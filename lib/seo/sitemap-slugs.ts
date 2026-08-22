/**
 * N4 — 사이트맵 유형 목록. **의존성이 없는 상수만** 둔다.
 *
 * 이 파일이 따로 있는 이유: 자식 사이트맵 경로를 알아야 하는 곳이 세 군데인데
 * (미들웨어 캐시 정책, 비공개 사이트 게이트, robots.txt) 셋 다 Edge 이거나
 * 가벼운 라우트라 DB 로더가 딸려 들어오면 안 된다. sitemap-sections.ts 는
 * 실제 조회를 하므로 import 하면 그 무게가 그대로 따라온다.
 *
 * 유형을 추가할 때는 여기에 slug 를 넣고, sitemap-sections.ts 에 로더를 등록하고,
 * app/sitemap-{slug}.xml/route.ts 를 만든다. 셋 중 하나라도 빠지면
 * scripts/check-sitemap-index.mjs 가 실패시킨다.
 */

export const SITEMAP_SECTION_SLUGS = [
  "pages",
  "complexes",
  "regions",
  "tx",
  "pairs",
  "reports",
  "notes",
  "glossary",
  "temperature",
  /* 지역 임장 가이드 — /tx 와 같은 지역 원천이라 tx 가 살아 있으면 함께 산다 */
  "imjang",
  "digest",
  /* [개선 #3, 2026-08-22] 색인을 열어 둔 두 상세 표면이 사이트맵에 없었다 —
     만들어 둔 페이지를 검색엔진에 알리지 않던 공백. 지금은 둘 다 0건이라
     optional(0개=사실)로 등록하고, 데이터가 생기는 즉시 자동으로 실린다. */
  "experts",
  "qna",
  /* 뉴스 요약 — 우리가 쓴 요약·핵심·FAQ 가 붙은 기사만 싣는다.
     원문 본문을 그대로 싣던 시절에는 색인도 사이트맵도 막는 게 맞았지만,
     상세 페이지가 우리 글로 바뀌면서(2026-08-04) 그 전제가 사라졌다.
     싣는 기준은 상세 페이지의 색인 조건과 같다 — build-sitemap.ts 의
     loadNewsEntries() 주석 참고. */
  "news",
] as const;

export type SitemapSectionSlug = (typeof SITEMAP_SECTION_SLUGS)[number];

/** /sitemap-complexes.xml */
export function sitemapSectionPath(slug: SitemapSectionSlug): string {
  return `/sitemap-${slug}.xml`;
}

export const SITEMAP_SECTION_PATHS: readonly string[] =
  SITEMAP_SECTION_SLUGS.map(sitemapSectionPath);

/** 인덱스 + 자식 전부 — 크롤러 엔드포인트 등록·공개 경로 허용에 쓴다. */
export const SITEMAP_INDEX_PATH = "/sitemap.xml";
export const SITEMAP_PATHS: readonly string[] = [
  SITEMAP_INDEX_PATH,
  ...SITEMAP_SECTION_PATHS,
];
