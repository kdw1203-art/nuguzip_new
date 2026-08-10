import type { PostAutomationMeta } from "@/lib/types/post";

/**
 * 뉴스 상세 SEO/GEO 헬퍼.
 *
 * 값은 board_posts.automation_meta 에 이미 들어 있다(매일 08:00 KST 수집 작업이
 * 채우고, 2026-08-04 에 과거분 88건까지 소급 적용). Post 타입이 automationMeta 를
 * 그대로 넘겨주므로 **추가 조회가 없다** — 여기서는 읽어서 모양만 잡는다.
 *
 *   seo = { seo_title, meta_description, slug, keywords[], key_points[],
 *           faq[{q,a}], summary, jsonld{} }
 *   geo = { scope, sido, sigungu, places[], landmarks[], address }
 */

export const SITE_URL = "https://nuguzip.com";

export type NewsSeo = {
  seo_title?: string;
  meta_description?: string;
  slug?: string;
  keywords?: string[];
  key_points?: string[];
  faq?: { q: string; a: string }[];
  summary?: string;
  /** 배경·맥락 — 원문에 없는 우리 정리(이전 정책 흐름·통계 배경). */
  context?: string;
  /** 시장 의미 — 원문에 없는 우리 해석(실수요자가 무엇을 봐야 하는가). */
  implication?: string;
  jsonld?: Record<string, unknown>;
};

export type NewsGeo = {
  scope?: "national" | "sido" | "sigungu";
  sido?: string | null;
  sigungu?: string | null;
  places?: string[];
  landmarks?: string[];
  address?: string | null;
};

export type NewsMeta = {
  seo: NewsSeo;
  geo: NewsGeo;
  summary: string | null;
  context: string | null;
  implication: string | null;
  aiReason: string | null;
  /** 우리가 직접 쓴 글이 갖춰졌는가 — 색인·렌더 분기의 단일 기준. */
  hasOwnContent: boolean;
};

/**
 * 색인을 여는 조건.
 *
 * 요약 120자 이상 + 핵심 문장 3개 이상. 하나라도 없으면 원문 본문에 기대는
 * 글이므로 종전대로 noindex 를 유지한다.
 *
 * ⚠️ lib/seo/build-sitemap.ts 의 loadNewsEntries() 가 **같은 조건**으로 거른다.
 *    한쪽만 바꾸면 사이트맵이 noindex 페이지를 광고하게 된다 — 함께 고칠 것.
 */
export function readNewsMeta(meta: PostAutomationMeta | undefined): NewsMeta {
  const m = (meta ?? {}) as Record<string, unknown>;
  const seo = (m.seo ?? {}) as NewsSeo;
  const geo = (m.geo ?? {}) as NewsGeo;
  const summary = typeof seo.summary === "string" ? seo.summary : null;
  const context = typeof seo.context === "string" ? seo.context : null;
  const aiReason = typeof m.ai_reason === "string" ? m.ai_reason : null;
  /* 시장 의미는 확장본(seo.implication)을 쓰고, 없으면 종전 선정 사유로 내려간다. */
  const implication =
    typeof seo.implication === "string" ? seo.implication : aiReason;

  const hasOwnContent =
    Array.isArray(seo.key_points) &&
    seo.key_points.length >= 3 &&
    typeof summary === "string" &&
    summary.trim().length >= 120;

  return { seo, geo, summary, context, implication, aiReason, hasOwnContent };
}

const UUID_RE =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** '<uuid>' 와 '<slug>-<uuid>' 를 모두 받아 uuid 만 뽑는다. */
export function extractUuid(param: string): string | null {
  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    /* 잘못 인코딩된 주소 — 원문 그대로 시도한다. */
  }
  const m = decoded.match(UUID_RE);
  return m ? m[1].toLowerCase() : null;
}

/** 정식 경로: /town/news/<slug>-<uuid> (slug 없으면 uuid 만) */
export function canonicalNewsPath(slug: string | undefined, uuid: string): string {
  if (!slug) return `/town/news/${uuid}`;
  return `/town/news/${encodeURIComponent(slug)}-${uuid}`;
}

export function canonicalNewsUrl(slug: string | undefined, uuid: string): string {
  return `${SITE_URL}${canonicalNewsPath(slug, uuid)}`;
}

/**
 * 요약을 화면용 문단으로 나눈다.
 *
 * 요약이 400자대일 때는 2문단으로 충분했지만 800~1,300자로 길어지면서
 * 문단 하나가 너무 길어졌다. 문장 3개 또는 260자 중 먼저 닿는 쪽에서 끊는다
 * (수집기 clean_body 의 단락화 규칙과 같은 기준).
 */
export function splitSummary(summary: string): string[] {
  const sents = summary
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sents.length <= 3) return [summary];

  const paras: string[] = [];
  let buf: string[] = [];
  for (const sent of sents) {
    buf.push(sent);
    if (buf.length >= 3 || buf.join(" ").length > 260) {
      paras.push(buf.join(" "));
      buf = [];
    }
  }
  if (buf.length) {
    // 마지막 한 문장만 남으면 앞 문단에 붙인다(고아 문단 방지)
    if (buf.length === 1 && paras.length) paras[paras.length - 1] += ` ${buf[0]}`;
    else paras.push(buf.join(" "));
  }
  return paras;
}

/**
 * 구조화 데이터.
 *
 * DB 의 jsonld 를 바탕으로 하되 URL 계열은 현재 정식 URL 로 덮어쓴다(slug 도입
 * 후에도 어긋나지 않게). author 는 **누구집**이다 — 이 페이지 본문이 원문 전재가
 * 아니라 우리가 쓴 요약·분석이기 때문이다. 원 매체는 citation / isBasedOn 으로
 * 명시해 출처는 그대로 밝히되 저작 주체를 사실대로 적는다.
 *
 * faq 가 있으면 FAQPage 를 @graph 로 함께 낸다 — 화면에 같은 내용이 있을 때만
 * 유효하므로 호출부에서 FAQ 섹션과 짝을 맞춰 그린다.
 */
export function buildNewsJsonLd(
  seo: NewsSeo,
  uuid: string,
  geo?: NewsGeo,
  sourceName?: string | null,
  sourceUrl?: string | null,
): Record<string, unknown> | null {
  if (!seo?.jsonld) return null;
  const url = canonicalNewsUrl(seo.slug, uuid);

  const article: Record<string, unknown> = {
    ...seo.jsonld,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "누구집", url: SITE_URL },
    publisher: { "@type": "Organization", name: "누구집", url: SITE_URL },
  };

  if (sourceUrl) {
    article.isBasedOn = sourceUrl;
    article.citation = {
      "@type": "CreativeWork",
      ...(sourceName ? { name: sourceName } : {}),
      url: sourceUrl,
    };
  }

  const places = (geo?.places ?? []).filter(Boolean);
  if (places.length) {
    article.contentLocation = places.map((name) => ({ "@type": "Place", name }));
  }
  if (geo?.address) {
    article.spatialCoverage = {
      "@type": "Place",
      name: geo.address,
      address: {
        "@type": "PostalAddress",
        addressLocality: geo.address,
        addressCountry: "KR",
      },
    };
  }

  const faq = (seo.faq ?? []).filter((f) => f?.q && f?.a);
  if (!faq.length) return article;

  return {
    "@context": "https://schema.org",
    "@graph": [
      article,
      {
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}
