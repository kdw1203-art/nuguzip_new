import "server-only";

import type { MetadataRoute } from "next";
import { logger } from "@/lib/log";
import {
  loadBandEntries,
  loadComplexEntries,
  loadGlossaryEntries,
  loadNoteEntries,
  loadPairEntries,
  loadRegionEntries,
  loadReportEntries,
  loadStaticEntries,
  serializeSitemap,
} from "@/lib/seo/build-sitemap";
import { capSitemapUrls } from "@/lib/seo/sitemap-entries";
import {
  SITEMAP_SECTION_SLUGS,
  sitemapSectionPath,
  type SitemapSectionSlug,
} from "@/lib/seo/sitemap-slugs";
import { CRAWLER_ENDPOINT_CACHE_CONTROL } from "@/lib/http/cache-policy";

/**
 * N4 — 사이트맵 인덱스 분할.
 *
 * 지금까지 /sitemap.xml 한 파일에 5,600여 개 URL 이 전부 들어 있었다. 동작에는
 * 문제가 없지만 두 가지가 아쉬웠다.
 *
 *   1) **진단이 안 된다.** 서치콘솔은 "제출 N개 / 색인 M개"를 사이트맵 단위로
 *      보여 준다. 한 파일이면 단지 페이지가 안 잡히는 건지 실거래 구간이 안
 *      잡히는 건지 구분할 방법이 없다 — 숫자 하나만 보고 감으로 말하게 된다.
 *      유형별로 쪼개면 "단지는 92%, 구간은 40%" 처럼 어디를 손봐야 하는지가
 *      바로 나온다.
 *   2) **상한이 다가온다.** 사이트맵 1파일 상한은 URL 50,000개·압축 전 50MB다.
 *      단지 5,147개는 아직 여유롭지만 실거래 구간(bands)은 데이터가 전국으로
 *      늘면 같이 늘어난다. 상한에 부딪히고 나서 쪼개면 그 사이에 잘린 URL 은
 *      그냥 색인 기회를 잃는다. 미리 나눠 둔다.
 *
 * ── 인덱스가 <lastmod> 를 적지 않는 이유 ──────────────────────────────
 * 사이트맵 인덱스의 <lastmod> 는 "이 자식 사이트맵이 마지막으로 바뀐 시각"이다.
 * 자식 안의 URL 중 가장 최근 갱신 시각으로 근사할 수는 있지만, 그러려면 인덱스
 * 요청 한 번이 모든 블록을 다 읽어야 한다. 대신 우리는 그 값을 **자식 사이트맵의
 * URL 마다** 정확히 적고 있다(lastmod 규칙은 build-sitemap.ts 주석 참고). 인덱스에
 * 근사값을 적어 두는 것보다 정확한 값을 자식에 두는 편이 낫고, 크롤러도 결국
 * 자식을 읽는다. 그래서 인덱스에는 <loc> 만 적는다 — 표준상 선택 항목이다.
 *
 * ── 비어 있는 자식을 광고하지 않는 이유 ────────────────────────────────
 * 서치콘솔은 URL 0개인 사이트맵을 오류로 표시한다. 그런데 "0개"의 원인은 둘로
 * 갈린다: 원래 없는 것(공개 노트가 아직 없음)과 조회가 실패한 것(DB 키 문제).
 * 앞의 경우는 인덱스에서 빼는 게 맞고, 뒤의 경우는 빼면 안 된다 — 크롤러에게
 * "그 URL 들은 이제 없다"는 잘못된 신호가 되기 때문이다. 그래서 유형마다
 * required 를 두고, required 인 유형은 비어도 인덱스에 계속 싣되(자식이 503 을
 * 준다) 인덱스 응답 자체는 캐시하지 않는다. 잘못된 상태를 한 시간 굳히지 않기
 * 위해서다.
 */

type SitemapSection = {
  slug: SitemapSectionSlug;
  /** 로그·문서용 한국어 이름 */
  label: string;
  /**
   * 이 유형은 데이터가 있어야 정상인가.
   *
   * true 면 "0개 = 조회 실패"로 본다(단지·지역·실거래 구간·정적 라우트·용어).
   * false 면 0개가 정상일 수 있다(공개 노트가 아직 없을 수 있고, 리포트는 수집
   * 순회가 한 달치도 끝나기 전이면 비어 있는 게 사실이다).
   */
  required: boolean;
  load: () => MetadataRoute.Sitemap | Promise<MetadataRoute.Sitemap>;
};

export const SITEMAP_SECTIONS: readonly SitemapSection[] = [
  { slug: "pages", label: "정적 페이지", required: true, load: loadStaticEntries },
  { slug: "complexes", label: "단지", required: true, load: loadComplexEntries },
  { slug: "regions", label: "지역 허브", required: true, load: loadRegionEntries },
  { slug: "tx", label: "실거래 구간", required: true, load: loadBandEntries },
  /* 단지 비교를 required 로 두는 이유: 조합의 통과 기준(같은 동 · 양쪽 12개월
     20건 이상 · 동별 상위 3개)은 서울·수도권 62개 구를 훑어 669개 조합을 남긴다.
     이 숫자가 0 이 되는 현실적인 경로는 "거래가 전부 사라졌다"가 아니라
     "조회가 실패했다"뿐이다. 그러니 0개는 실패로 다루는 편이 사실에 가깝다. */
  { slug: "pairs", label: "단지 비교", required: true, load: loadPairEntries },
  { slug: "reports", label: "월간 리포트", required: false, load: loadReportEntries },
  { slug: "notes", label: "공개 임장노트", required: false, load: loadNoteEntries },
  { slug: "glossary", label: "용어사전", required: true, load: loadGlossaryEntries },
];

const SECTION_BY_SLUG = new Map(SITEMAP_SECTIONS.map((s) => [s.slug, s]));

/* slug 목록과 로더 등록이 어긋나면(둘 중 하나만 추가) 인덱스가 없는 자식을
   광고하거나 있는 자식을 빠뜨린다. 모듈 로드 시점에 바로 터뜨린다. */
for (const slug of SITEMAP_SECTION_SLUGS) {
  if (!SECTION_BY_SLUG.has(slug)) {
    throw new Error(
      `[sitemap] slug "${slug}" 의 로더가 SITEMAP_SECTIONS 에 없습니다 — sitemap-sections.ts 에 등록하세요.`,
    );
  }
}

const BASE_URL = "https://nuguzip.com";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function serializeSitemapIndex(paths: readonly string[]): string {
  const body = paths
    .map((p) => `<sitemap>\n<loc>${xmlEscape(`${BASE_URL}${p}`)}</loc>\n</sitemap>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/**
 * 인덱스 응답 본문 + 캐시 가능 여부.
 *
 * 유형별 개수를 세려면 결국 전부 읽어야 한다. 인덱스는 크롤러가 자주 가져가는
 * 문서가 아니고 한 시간 캐시되므로 이 비용은 받아들인다 — 대신 "실제로 URL 이
 * 있는 자식만 싣는다"는 정확성을 얻는다.
 */
export async function buildSitemapIndex(): Promise<{ xml: string; cacheable: boolean }> {
  const counted = await Promise.all(
    SITEMAP_SECTIONS.map(async (s) => ({ section: s, count: (await s.load()).length })),
  );

  const missing = counted.filter((c) => c.section.required && c.count === 0);
  if (missing.length > 0) {
    logger.warn(
      `[sitemap] 인덱스: 비어 있으면 안 되는 유형이 비었습니다 — ` +
        `${missing.map((m) => `${m.section.label}(${m.section.slug})`).join(", ")}. ` +
        `조회 실패일 가능성이 높아 인덱스를 캐시하지 않습니다.`,
    );
  }

  // required 는 비어도 싣는다(자식이 503 으로 "지금 없음"을 말한다).
  // optional 은 비면 뺀다(URL 0개 사이트맵은 서치콘솔에서 오류로 잡힌다).
  const paths = counted
    .filter((c) => c.section.required || c.count > 0)
    .map((c) => sitemapSectionPath(c.section.slug));

  return { xml: serializeSitemapIndex(paths), cacheable: missing.length === 0 };
}

/**
 * 자식 사이트맵 라우트 핸들러 생성기.
 *
 * 라우트 파일이 유형마다 하나씩 필요한 이유: Next 앱 라우터는 `sitemap-[x].xml`
 * 같은 부분 동적 세그먼트를 지원하지 않는다. 대신 파일은 4줄짜리 위임만 두고
 * 내용은 전부 여기 모아 둔다.
 */
export function sitemapSectionRoute(slug: SitemapSectionSlug) {
  return async function GET(): Promise<Response> {
    const section = SECTION_BY_SLUG.get(slug);
    if (!section) return new Response("Not Found", { status: 404 });

    const entries = capSitemapUrls(await section.load());

    /* required 인데 0개 = 조회 실패다. 빈 <urlset> 을 200 으로 주면 크롤러에게
       "이 유형의 URL 은 전부 없어졌다"고 말하는 셈이라, 사실이 아닌 신호를
       보내느니 "지금은 못 준다"(503)고 하는 편이 정확하다. */
    if (section.required && entries.length === 0) {
      logger.error(
        `[sitemap] ${sitemapSectionPath(slug)} — ${section.label} 조회 결과가 0개입니다(503 응답).`,
      );
      return new Response("Sitemap temporarily unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "600" },
      });
    }

    return new Response(serializeSitemap(entries), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": CRAWLER_ENDPOINT_CACHE_CONTROL,
        "X-Robots-Tag": "noindex",
      },
    });
  };
}
