import "server-only";

import type { MetadataRoute } from "next";
import { logger } from "@/lib/log";
import {
  loadBandEntries,
  loadComplexEntries,
  loadDigestEntries,
  loadExpertEntries,
  loadGlossaryEntries,
  loadImjangEntries,
  loadNewsEntries,
  loadNoteEntries,
  loadPairEntries,
  loadQnaEntries,
  loadRegionEntries,
  loadReportEntries,
  loadStaticEntries,
  loadTemperatureEntries,
  serializeSitemap,
} from "@/lib/seo/build-sitemap";
import { capSitemapUrls } from "@/lib/seo/sitemap-entries";
import {
  SITEMAP_SECTION_SLUGS,
  sitemapSectionPath,
  type SitemapSectionSlug,
} from "@/lib/seo/sitemap-slugs";
import { CRAWLER_ENDPOINT_CACHE_CONTROL } from "@/lib/http/cache-policy";
import { withBudget } from "@/lib/async/with-budget";

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
  /* N11 시장 온도를 required 로 두지 않는 이유: 이 유형은 주간 스냅샷 크론이 한 번
     이라도 돌아야 행이 생긴다. 첫 실행 전에는 0개가 **사실**이고, 그때 503 을 내면
     "지금은 못 준다"는 거짓말이 된다. 크론이 도는 순간부터는 62개 언저리로 채워지고,
     그 뒤에 0 이 되면 required 여부와 무관하게 인덱스에서 빠지면서 드러난다. */
  { slug: "temperature", label: "시장 온도 주간 기록", required: false, load: loadTemperatureEntries },
  /* 임장 가이드 — tx 와 같은 지역 원천이므로 tx 가 required 로 살아 있는 한
     0개가 되는 현실적 경로는 조회 실패뿐이다. required 로 같은 기준을 적용한다. */
  { slug: "imjang", label: "임장 가이드", required: true, load: loadImjangEntries },
  /* N23 주간 아카이브도 required 가 아니다. 아카이브는 **완결된** 주만 싣고
     항목이 기준 미만인 주는 아예 만들지 않으므로, 수집이 막 시작된 시기에는
     0개가 사실이다. 그때 503 을 내면 "지금은 못 준다"는 거짓이 된다. */
  { slug: "digest", label: "주간 다이제스트 아카이브", required: false, load: loadDigestEntries },
  /* 뉴스 요약을 required 로 두는 이유: 백필까지 끝나 우리 요약을 가진 기사가
     88건 있고(2026-08-04), 매일 08:00 KST 수집이 10건씩 더한다. 이 숫자가 0 이
     되는 현실적인 경로는 "기사가 전부 사라졌다"가 아니라 "조회가 실패했다" 또는
     "요약 파이프라인이 멈췄다"뿐이다. 둘 다 조용히 넘어가면 안 되는 상태다. */
  { slug: "news", label: "뉴스 요약", required: true, load: loadNewsEntries },
  /* [개선 #3, 2026-08-22] 색인 열린 두 상세 표면의 사이트맵 공백 수리.
     둘 다 현재 0건이 사실(전문가·질문 미등록)이므로 optional — 0개면 인덱스에서
     빠지고, 첫 데이터가 생기는 즉시 자동으로 실린다. */
  { slug: "experts", label: "전문가 프로필", required: false, load: loadExpertEntries },
  { slug: "qna", label: "단지 Q&A", required: false, load: loadQnaEntries },
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
 * optional 유형 하나의 "비었는지" 판정에 주는 시간(ms).
 *
 * 2026-07-26 프로덕션 오류를 보면 사이트맵 경로들이 하루에 100건 가까이
 * `Vercel Runtime Timeout Error: Task timed out after 300 seconds` 로 죽고 있었다
 * (/sitemap.xml 48 · /sitemap-pairs.xml 36 · /sitemap-regions.xml 12 ·
 * /sitemap-complexes.xml 4). 서치어드바이저에 사이트맵을 제출했을 때 나온
 * "접근 실패 · Status 0 · HTTP 응답을 받지 못했습니다" 가 바로 이것이다.
 *
 * 인덱스는 **제출하는 그 주소**라서 늦게라도 정확한 답보다 제때 뜨는 답이 낫다.
 * 그래서 판정에 예산을 주고, 예산을 넘기면 기다리지 않는다. 다만 넘겼다고
 * "URL 이 없다"로 해석하지는 않는다 — 모르는 것은 모르는 것이라, 아래에서
 * 조회 실패와 똑같이 "싣되 캐시하지 않는다"로 처리한다. 6초는 네 유형이
 * 병렬로 도니 인덱스 전체 상한이기도 하다.
 */
const INDEX_PROBE_BUDGET_MS = 6_000;

/**
 * 자식 사이트맵 한 장을 만드는 데 주는 시간(ms).
 *
 * 인덱스보다 훨씬 넉넉하다 — 자식은 실제로 URL 을 다 만들어야 하고(단지 5,147개
 * 같은 규모), 정상 상태에서는 십수 초 안에 끝난다. 여기서 상한을 두는 목적은
 * 느린 생성을 잘라내는 게 아니라 **무응답을 응답으로 바꾸는 것**이다.
 * 300초를 다 태우고 죽으면 크롤러는 아무것도 못 받지만, 45초 뒤 503 + Retry-After
 * 는 "지금은 못 준다, 나중에 오라"는 분명한 말이다.
 */
const SECTION_LOAD_BUDGET_MS = 45_000;

/**
 * 인덱스 응답 본문 + 캐시 가능 여부.
 *
 * ── 왜 required 유형은 읽지 않는가 (2026-07-26 실측으로 바꿈) ─────────────
 * 원래는 열 유형을 **전부 읽어서** 개수를 셌다. 인덱스는 자주 안 가져가고 한 시간
 * 캐시되니 그 비용을 받아들인다고 적어 두었는데, 실제로 재 보니 받아들일 수 있는
 * 값이 아니었다. 운영 `/sitemap.xml` 을 연달아 두 번 재니:
 *
 *     1회차  90초 안에 응답 없음(타임아웃)
 *     2회차  200, 14.4초
 *
 * 사이트맵 인덱스는 서치콘솔·서치어드바이저에 **제출하는 바로 그 주소**다.
 * 제출 시점에 안 뜨면 등록 자체가 실패한다. 개수를 세느라 5,147개 단지와
 * 실거래 구간 전체를 매 요청 다시 만들고 있었던 것이 원인이다.
 *
 * 그런데 그 개수는 required 유형에서는 **아무 결정에도 쓰이지 않는다.**
 * required 는 비어도 인덱스에 싣기 때문이다(자식이 503 으로 "지금 없음"을 말한다).
 * 개수가 유일하게 바꾸던 것은 캐시 여부인데, 인덱스 **본문은 어차피 똑같다** —
 * 한 시간 캐시해도 크롤러가 보는 내용이 달라지지 않는다. 그리고 "조회가 실패했다"는
 * 사실은 자식 응답(503 + no-store)에 그대로 남아 있으니 신호를 잃지도 않는다.
 * 그래서 required 유형은 읽지 않고 바로 싣는다.
 *
 * optional 은 여전히 읽어야 한다 — 0개면 인덱스에서 빼야 하는데(URL 0개
 * 사이트맵은 서치콘솔에서 오류로 잡힌다) 그 판단에 개수가 실제로 쓰인다.
 * 다만 **조회가 실패해서 0인 것과 원래 없어서 0인 것을 섞지 않는다.** 실패는
 * 예외로 올라오므로 잡아서 "뺄지 말지 모른다"로 다루고, 빼지 않고 싣되 캐시하지
 * 않는다. 못 읽은 것을 "이제 없다"로 광고하는 쪽이 훨씬 나쁜 거짓말이다.
 */
export async function buildSitemapIndex(): Promise<{ xml: string; cacheable: boolean }> {
  const optional = SITEMAP_SECTIONS.filter((s) => !s.required);

  let cacheable = true;
  const decided = await Promise.all(
    optional.map(async (section) => {
      /* 판정이 예산 안에 안 끝나면 기다리지 않는다. 이유는 INDEX_PROBE_BUDGET_MS
         주석 참고 — 이 주소는 서치콘솔·서치어드바이저에 제출하는 바로 그 URL 이고,
         제출 시점에 안 뜨면 등록 자체가 실패한다. */
      const probe = await withBudget(
        Promise.resolve().then(() => section.load()),
        INDEX_PROBE_BUDGET_MS,
      );
      if (probe.state === "ok") return { slug: section.slug, include: probe.value.length > 0 };

      cacheable = false;
      if (probe.state === "timeout") {
        logger.error(
          `[sitemap] 인덱스: ${section.label}(${section.slug}) 판정이 ` +
            `${INDEX_PROBE_BUDGET_MS}ms 안에 끝나지 않았습니다. ` +
            `비었는지 알 수 없으므로 인덱스에 싣고, 응답을 캐시하지 않습니다.`,
        );
      } else {
        logger.error(
          `[sitemap] 인덱스: ${section.label}(${section.slug}) 조회에 실패했습니다 — ` +
            `${probe.error instanceof Error ? probe.error.message : String(probe.error)}. ` +
            `"URL 이 없다"와 구분되지 않으므로 인덱스에서 빼지 않고 싣고, 응답을 캐시하지 않습니다.`,
        );
      }
      return { slug: section.slug, include: true };
    }),
  );
  const includeOptional = new Map(decided.map((d) => [d.slug, d.include]));

  // 선언 순서를 그대로 유지한다 — 인덱스 순서가 흔들리면 diff 를 읽기 어렵다.
  const paths = SITEMAP_SECTIONS.filter((s) => s.required || includeOptional.get(s.slug)).map((s) =>
    sitemapSectionPath(s.slug),
  );

  return { xml: serializeSitemapIndex(paths), cacheable };
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

    const loaded = await withBudget(
      Promise.resolve().then(() => section.load()),
      SECTION_LOAD_BUDGET_MS,
    );

    if (loaded.state === "timeout") {
      /* 상한을 넘겼다. 예전에는 여기서 그냥 계속 기다렸고, 그 끝은 응답이 아니라
         `Vercel Runtime Timeout Error: Task timed out after 300 seconds` 였다.
         크롤러 쪽에서는 그게 "Status 0 · HTTP 응답을 받지 못했습니다(네트워크
         오류)" 로 보인다 — 서치어드바이저 사이트맵 제출이 실패한 이유가 이것이다.
         같은 실패라도 503 + Retry-After 는 "나중에 다시 오라"는 말이 되고,
         무응답은 아무 말도 아니다. 늦게라도 정확한 답보다 제때 뜨는 답이 낫다. */
      logger.error(
        `[sitemap] ${sitemapSectionPath(slug)} — ${section.label} 생성이 ` +
          `${SECTION_LOAD_BUDGET_MS}ms 안에 끝나지 않았습니다(503 응답).`,
      );
      return new Response("Sitemap temporarily unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "600" },
      });
    }

    if (loaded.state === "error") {
      /* 조회 실패. 빈 <urlset> 을 200 으로 주면 크롤러에게 "이 유형의 URL 은
         전부 없어졌다"고 적극적으로 거짓말하는 셈이다. 못 준다고 말한다.
         (required 여부와 무관하다 — 실패는 어느 유형에서든 실패다.) */
      const err = loaded.error;
      logger.error(
        `[sitemap] ${sitemapSectionPath(slug)} — ${section.label} 조회에 실패했습니다(503 응답). ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return new Response("Sitemap temporarily unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "600" },
      });
    }

    const entries: MetadataRoute.Sitemap = capSitemapUrls(loaded.value);

    /* 예외 없이 0개인데 그러면 안 되는 유형 = 조용한 실패다(로더가 부분 결과를
       정상처럼 돌려주는 경로가 남아 있을 수 있다). 이때도 200 대신 503 을 낸다. */
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
