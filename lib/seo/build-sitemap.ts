import "server-only";

import type { MetadataRoute } from "next";
import { logger } from "@/lib/log";
import { listPublicNotes } from "@/lib/inspection/store-db";
import { glossaryPaths } from "@/lib/seo/glossary-terms";
import {
  listBandSitemapEntries,
  listComplexSitemapEntries,
  periodToDate,
} from "@/lib/seo/sitemap-entries";

/* 사이트맵 본문 생성 — 정적 공개 라우트 + 공개 임장노트 + 단지 + 지역 + 실거래 구간.
   DB 조회 실패(env 미설정 등) 시 그 블록만 비우고 나머지는 그대로 낸다.

   ── G6 에서 바뀐 것 ────────────────────────────────────────────
   1) 단지 URL: searchComplexes() 는 내부 `.limit(800)` 때문에 5,147개 단지 중
      수백 개만 냈다. complex_sitemap_source 뷰로 전부 싣는다.
   2) lastModified: 예전엔 전 URL 에 `new Date()` 를 찍었다. 매 크롤마다 모든
      페이지가 방금 바뀌었다고 주장하는 셈이라, 크롤러 입장에선 신호가 아니라
      잡음이다(그리고 사실이 아니다). 이제는 확인된 갱신 시각이 있는 URL 에만
      적고, 없으면 아예 생략한다 — <lastmod> 는 선택 항목이다.
   3) changeFrequency: 삭제. Google 은 이 값을 무시한다고 명시했고, 우리가 적던
      "weekly" 는 근거 없는 추측이었다. priority 는 우리 쪽 상대 중요도 표현이라
      사실 주장이 아니므로 유지한다.

   ── 왜 app/sitemap.ts 가 아니라 이 모듈 + 라우트 핸들러인가 (실측 근거) ────
   메타데이터 규약(app/sitemap.ts)에서는 캐시 방식이 두 가지뿐이었고 둘 다 틀렸다.

   (a) `dynamic = "force-dynamic"`: 미들웨어가 붙인 크롤러 캐시 정책이 Next 자체
       헤더에 덮여 `public, max-age=0, must-revalidate` + `x-vercel-cache: MISS`
       로 나갔다. 크롤이 올 때마다 5,615개 URL(약 980KB)을 DB 조회 네 번으로
       새로 만들고 있었다.
   (b) `revalidate = 3600`: 캐시는 붙었지만 생성 시점이 **빌드 타임**으로 옮겨갔다.
       빌드 환경에는 SUPABASE_SERVICE_ROLE_KEY 가 없어서 getServiceSupabase() 가
       null 을 주고, 공개노트·단지·지역 세 블록이 통째로 비었다. 실측: 운영
       /sitemap.xml 이 5,615개 → 403개(정적 53 + 실거래 구간 350)로 줄었다.
       실거래 구간만 살아남은 이유는 그 로더만 getReadOnlySupabase() 폴백을
       쓰기 때문이다(lib/market/tx-bands.ts 주석 참고).

   그래서 라우트 핸들러(app/sitemap.xml/route.ts)로 옮겼다. 런타임에 생성하니
   서비스 롤이 항상 있고(= 데이터가 빠지지 않는다), 응답에 Cache-Control 을
   직접 실으니 Next 가 덮지 않는다(= CDN 공유 캐시가 실제로 걸린다). */

const BASE_URL = "https://nuguzip.com";

const STATIC_ROUTES: Array<{ path: string; priority: number }> = [
  { path: "", priority: 1 },
  { path: "/notes", priority: 0.9 },
  { path: "/notes/templates", priority: 0.6 },
  /* /notes/compare 는 개인 비교 화면(noindex) — 사이트맵에서 제외 (항목 46) */
  { path: "/map", priority: 0.9 },
  /* /search 는 noindex(쿼리 화면) — 사이트맵에서 제외 (항목 46a) */
  { path: "/recommend", priority: 0.6 },
  { path: "/analysis", priority: 0.8 },
  { path: "/analysis/compare", priority: 0.6 },
  /* cycle/price/scenario/portfolio/switch 는 noIndex 데모·시뮬레이션 — 사이트맵에서 제외 */
  { path: "/analysis/timing", priority: 0.6 },
  { path: "/analysis/temperature", priority: 0.6 },
  { path: "/town", priority: 0.8 },
  { path: "/town/news", priority: 0.7 },
  { path: "/town/library", priority: 0.7 },
  { path: "/town/experts", priority: 0.6 },
  { path: "/town/groups", priority: 0.6 },
  // 단지 Q&A (커뮤니티 질문·답변)
  { path: "/qna", priority: 0.6 },
  // 서울 단지별 실거래 브라우즈 (국토부 실거래가 기반)
  { path: "/complex/browse", priority: 0.8 },
  // N10 — 단지 vs 단지 비교 허브 (하위 조합은 아래 pairEntries 로 개별 등록)
  { path: "/complex/compare", priority: 0.7 },
  // 지역 × 면적대·가격대 실거래 랜딩 인덱스 (A5) — 하위는 아래 bandEntries 로 개별 등록
  { path: "/tx", priority: 0.8 },
  // 실매물 (집주인 직접·중개사 등록) + 중개사 제휴 안내
  { path: "/listings", priority: 0.8 },
  { path: "/partners", priority: 0.5 },
  { path: "/calculator", priority: 0.6 },
  { path: "/widget", priority: 0.5 }, // N17 — 시세 위젯 배포 안내
  // 가이드 (규제·세금 안내 · 계약 체크리스트)
  { path: "/guides/regulations", priority: 0.5 },
  { path: "/guides/contract", priority: 0.5 },
  { path: "/apply", priority: 0.6 },
  { path: "/digest", priority: 0.6 },
  // 정비사업 추적 라이트 — 단계 안내 + 정비사업 뉴스
  { path: "/redevelopment", priority: 0.6 },
  // 공공 부동산 자료 현황 (KB 시세·공시가격·실거래 연동)
  { path: "/data/records", priority: 0.5 },
  // 아파트 입주 예정 물량(공급 캘린더)
  { path: "/supply", priority: 0.7 },
  // 온비드 서울 공매 + 법원경매 물건
  { path: "/auctions", priority: 0.7 },
  // 개발물건 중개 (B2B 디벨로퍼 매칭)
  { path: "/dev-deals", priority: 0.7 },
  { path: "/dev-deals/partners", priority: 0.5 },
  { path: "/dev-deals/fees", priority: 0.4 },
  // 매물 등록·포인트
  { path: "/listings/new", priority: 0.6 },
  { path: "/points/shop", priority: 0.5 },
  // 발견 피드 — 탭바 2번 슬롯·비로그인 랜딩 (감사 P1-11)
  { path: "/subscription", priority: 0.5 },
  { path: "/support", priority: 0.4 },
  { path: "/support/faq", priority: 0.5 }, // N15 — 답이 본문에 실린 FAQ 허브
  { path: "/safety", priority: 0.4 },
  { path: "/methodology", priority: 0.5 }, // G18 — 데이터 방법론 (EEAT·GEO 인용 근거)
  { path: "/glossary", priority: 0.5 }, // S14 — 정의형 용어사전
  { path: "/developers", priority: 0.4 }, // N20 — 공개 집계 JSON API 문서
  { path: "/reports", priority: 0.6 }, // S11 — 월간 실거래 리포트 허브
  { path: "/about", priority: 0.4 }, // G22 — 소개·운영 원칙
  // 법적 고지 허브 + 하위 8종 (감사 P1-11)
  { path: "/legal", priority: 0.3 },
  { path: "/legal/terms", priority: 0.3 },
  { path: "/legal/privacy", priority: 0.3 },
  { path: "/legal/location", priority: 0.3 },
  { path: "/legal/youth", priority: 0.3 },
  { path: "/legal/community", priority: 0.3 },
  { path: "/legal/expert", priority: 0.3 },
  { path: "/legal/fees", priority: 0.3 },
  { path: "/legal/privacy-request", priority: 0.3 },
  /* /login·/signup 은 noindex 계정 흐름 — 사이트맵에서 제외 (항목 46b) */
];

/* ══ N4 — 유형별 로더 ═══════════════════════════════════════════════════
   사이트맵 인덱스 분할(/sitemap.xml → /sitemap-{유형}.xml)을 하려면 블록을
   따로 부를 수 있어야 한다. 그래서 buildSitemap() 안에 인라인으로 있던 블록을
   그대로 함수로 뗐다(로직·우선순위·lastModified 규칙 모두 동일).

   합치는 buildSitemap() 은 없앴다. 인덱스로 바뀐 뒤로 부르는 곳이 없어졌는데,
   "언젠가 쓸지도 모르니 남긴다"는 이유로 두면 다음 사람이 살아 있는 경로로 읽고
   여기만 고친다. 유형별 개수 계측과 "비면 안 되는 블록이 비었다" 경고는
   lib/seo/sitemap-sections.ts 의 buildSitemapIndex() 로 옮겼다 — 실제로 매
   인덱스 요청마다 돌아가는 자리다. */

/**
 * 로더 공통 실패 처리 — **이유를 반드시 남긴다.**
 *
 * 원래 모든 로더가 `catch { return [] }` 였다. 그래서 "조회가 실패했다"와
 * "그 유형의 URL 이 원래 없다"가 호출부에서 완전히 같은 값으로 보였다.
 * 실제 사고: 단지 집계 쿼리가 PostgREST 8초 타임아웃에 걸려 취소되고 있었는데
 * 로그가 한 줄도 안 남아서, /sitemap-complexes.xml 이 503 을 내는 것만 보고
 * 원인을 역추적해야 했다. 25,171개 단지 URL 이 그동안 색인에서 빠져 있었다.
 *
 * ── 2026-07-26: 빈 배열로 바꾸는 것까지 그만둔다 ────────────────────────
 * 로그를 남기게 한 뒤에도 **반환값**은 여전히 `[]` 였다. 필수 유형은 그래도
 * 괜찮았다(0개 = 실패로 보고 503 을 낸다). 문제는 선택 유형이다 —
 * 리포트·공개노트·시장온도·주간 아카이브는 0개가 정상일 수 있어서, 조회 실패로
 * 생긴 `[]` 와 "원래 없음"이 호출부에서 **완전히 같은 값**이 된다. 그러면
 * 사이트맵 인덱스가 그 유형을 조용히 빼 버리고, 크롤러는 그것을
 * "이 URL 들은 이제 없다"로 읽는다. 못 읽은 것을 없어졌다고 광고하는 셈이다.
 *
 * 그래서 이제 실패를 **위로 던진다**. 두 호출부가 각자 맞게 처리한다:
 *   - 자식 라우트(sitemapSectionRoute): 503 + no-store — "지금은 못 준다"
 *   - 인덱스(buildSitemapIndex): 그 유형을 빼지 않고 싣고, 응답을 캐시하지 않음
 * 어느 쪽도 실패를 200 이나 "없음"으로 바꾸지 않는다.
 */
export class SitemapSectionError extends Error {
  readonly sectionName: string;
  constructor(sectionName: string, cause: unknown) {
    super(
      `[sitemap] "${sectionName}" 유형을 만들지 못했습니다 — ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
    this.name = "SitemapSectionError";
    this.sectionName = sectionName;
  }
}

async function section(
  name: string,
  load: () => Promise<MetadataRoute.Sitemap>,
): Promise<MetadataRoute.Sitemap> {
  try {
    return await load();
  } catch (e) {
    /* 로그는 여기서 남긴다 — 원인(cause)이 살아 있는 가장 가까운 자리다.
       호출부는 "무엇을 응답할지"만 정하면 된다. */
    logger.error(
      `[sitemap] "${name}" 유형을 만들지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`,
    );
    throw new SitemapSectionError(name, e);
  }
}

/** 정적 라우트는 배포할 때 바뀐다 — 언제였는지 런타임에 알 방법이 없으므로
    lastModified 를 적지 않는다(추측한 날짜보다 없는 편이 정확하다). */
export function loadStaticEntries(): MetadataRoute.Sitemap {
  return STATIC_ROUTES.map((r) => ({
    url: `${BASE_URL}${r.path}`,
    priority: r.priority,
  }));
}

export async function loadNoteEntries(): Promise<MetadataRoute.Sitemap> {
  return section("공개 임장노트", async () => {
    const notes = await listPublicNotes(200);
    const noteEntries: MetadataRoute.Sitemap = notes
      .filter((n) => n.isPublic)
      .map((n) => {
        const at = n.updatedAt ? new Date(n.updatedAt) : null;
        return {
          url: `${BASE_URL}/notes/${n.id}`,
          ...(at && !Number.isNaN(at.getTime()) ? { lastModified: at } : {}),
          priority: 0.7,
        };
      });

    /* N13 — 이달의 공개 임장노트. 위에서 읽은 노트로 그대로 계산한다(같은
       질의를 두 번 던지지 않는다). 기준 미달로 만들어지지 않는 달은
       bestNoteMonthsFrom 이 애초에 내보내지 않으므로, 사이트맵에 404 가
       될 URL 이 실리지 않는다. */
    const { bestNoteMonthsFrom } = await import("@/lib/inspection/best-notes");
    const bestMonths = bestNoteMonthsFrom(notes);
    if (bestMonths.length === 0) return noteEntries;
    return [
      ...noteEntries,
      { url: `${BASE_URL}/notes/best`, priority: 0.6 },
      ...bestMonths.map((m) => ({ url: `${BASE_URL}/notes/best/${m.ym}`, priority: 0.6 })),
    ];
  });
}

/** 프로그래매틱 SEO 핵심 랜딩 — 실거래가 있는 단지 전체(2026-07-26 기준 25,171개). */
export async function loadComplexEntries(): Promise<MetadataRoute.Sitemap> {
  return section("단지", async () => {
    const complexes = await listComplexSitemapEntries();
    return complexes.map((c) => ({
      url: `${BASE_URL}/complex/${c.id}`,
      ...(c.lastModified ? { lastModified: c.lastModified } : {}),
      priority: 0.8,
    }));
  });
}

/** 지역 허브 SEO 페이지 — market_region_price 61개 지역 (/region/[id]) */
export async function loadRegionEntries(): Promise<MetadataRoute.Sitemap> {
  return section("지역", async () => {
    const { getAllRegionSnapshots } = await import("@/lib/market/store");
    const snapshots = await getAllRegionSnapshots();
    return [...snapshots.values()].map((s) => {
      const at = periodToDate(s.period);
      return {
        url: `${BASE_URL}/region/${s.regionId}`,
        ...(at ? { lastModified: at } : {}),
        priority: 0.8,
      };
    });
  });
}

/** A5 — 지역 × 면적대·가격대 실거래 랜딩. 거래 10건 이상인 셀만 페이지가 있으므로
    여기 실리는 URL 은 전부 실제 데이터가 있는 페이지다(사이트맵에 404 를 넣지 않는다). */
export async function loadBandEntries(): Promise<MetadataRoute.Sitemap> {
  return section("실거래 구간", async () => {
    const bands = await listBandSitemapEntries();
    return bands.map((b) => ({
      url: `${BASE_URL}${b.path}`,
      ...(b.lastModified ? { lastModified: b.lastModified } : {}),
      priority: b.isHub ? 0.7 : 0.6,
    }));
  });
}

/**
 * N10 — 단지 vs 단지 비교. MV(market_agg.complex_pair_mv)에 있는 조합만 페이지가
 * 존재하므로, 여기 실리는 URL 은 전부 200 이 나오는 페이지다.
 *
 * lastModified 는 `last_data_at`(그 단지 거래를 마지막으로 수집한 시각)을 쓴다.
 * 계약월(last_contract_ym)은 월 단위라 "언제 바뀌었나"를 말하기엔 너무 거칠고,
 * 수집 시각은 실제로 이 페이지의 내용이 갱신될 수 있었던 시점이다.
 */
export async function loadPairEntries(): Promise<MetadataRoute.Sitemap> {
  return section("단지 비교", async () => {
    const { listComplexPairs, complexPairPath } = await import("@/lib/market/complex-pairs");
    const pairs = await listComplexPairs();
    return pairs.map((p) => ({
      url: `${BASE_URL}${complexPairPath(p)}`,
      ...(p.lastDataAt ? { lastModified: p.lastDataAt } : {}),
      priority: 0.6,
    }));
  });
}

/**
 * N11 — 시장 온도 주간 기록의 지역별 페이지.
 *
 * 아카이브에 **한 주라도 값이 있는 지역만** 싣는다. 대상 지역 목록
 * (TEMPERATURE_REGIONS)을 그대로 쓰면 지수 시계열이 부족해 아직 점수를 만들지
 * 못한 지역까지 광고하게 되는데, 그 페이지는 "아직 기록이 없습니다"만 적고
 * noindex 로 나간다 — 크롤러를 빈 페이지로 부르는 셈이다.
 *
 * lastModified 를 적지 않는 이유: 이 페이지의 내용은 "그 지역의 주간 기록 전체"라
 * 마지막 주의 날짜(week_start)는 내용이 바뀐 시각이 아니라 관측 구간의 이름이다.
 * 정확한 갱신 시각을 알려면 지역마다 observed_at 최댓값을 따로 읽어야 하는데,
 * 사이트맵 한 번에 62번의 추가 조회를 붙일 만한 값어치가 없다. 추측한 날짜를
 * 적느니 생략한다(정적 라우트와 같은 원칙).
 */
export async function loadTemperatureEntries(): Promise<MetadataRoute.Sitemap> {
  return section("시장 온도 주간 기록", async () => {
    const { listArchivedRegionIds } = await import("@/lib/market/temperature-archive");
    const ids = await listArchivedRegionIds();
    return ids.map((id) => ({
      url: `${BASE_URL}/analysis/temperature/${encodeURIComponent(id)}`,
      priority: 0.6,
    }));
  });
}

/**
 * N23 — 주간 다이제스트 아카이브.
 *
 * 완결된 주 중 수집 항목이 기준을 넘긴 주만 나온다(lib/digest/archive.ts).
 * 페이지가 404 로 답할 URL 을 사이트맵에 넣지 않는다는 원칙은 여기서도 같다.
 * lastmod 는 적지 않는다 — 주 페이지의 내용은 그 주가 끝난 뒤에는 사실상
 * 바뀌지 않고, 주소의 날짜가 이미 관측 구간을 말해 주기 때문이다.
 */
export async function loadDigestEntries(): Promise<MetadataRoute.Sitemap> {
  return section("주간 다이제스트 아카이브", async () => {
    const { listDigestWeeks } = await import("@/lib/digest/archive");
    const weeks = await listDigestWeeks();
    if (weeks.length === 0) return [];
    return [
      { url: `${BASE_URL}/digest/archive`, priority: 0.6 },
      ...weeks.map((w) => ({ url: `${BASE_URL}/digest/${w.slug}`, priority: 0.5 })),
    ];
  });
}

/** S11 — 월간 실거래 리포트 (데이터 있는 달만 — 빈 리포트 URL 을 넣지 않는다) */
export async function loadReportEntries(): Promise<MetadataRoute.Sitemap> {
  return section("월간 실거래 리포트", async () => {
    const { listReportMonths } = await import("@/lib/reports/monthly");
    const { listSeasonAvailability } = await import("@/lib/reports/seasonal");
    const months = await listReportMonths();
    /* N12 — 계절 리포트는 같은 월 요약에서 순수 계산으로 나오므로 조회가 늘지
       않는다. 관측된 계절(모든 달이 확정 집계된 해가 1개 이상)만 싣는다 —
       페이지가 404 로 답할 URL 을 사이트맵에 넣지 않는다. */
    return [
      ...months.map((m) => ({
        url: `${BASE_URL}/reports/${m.ym}`,
        priority: 0.7,
      })),
      ...listSeasonAvailability(months).map((s) => ({
        url: `${BASE_URL}/reports/season/${s.def.slug}`,
        priority: 0.6,
      })),
    ];
  });
}

/**
 * 뉴스 요약 페이지 — 우리가 쓴 요약이 붙은 기사만.
 *
 * ── 왜 이 유형이 이제야 생겼나 ────────────────────────────────────────
 * 2026-07-27 판단은 옳았다. 그때 board_posts 공개 글은 전부 자동수집이었고
 * 118개 매체 기사의 **본문을 그대로** 싣고 있었다. 원문과 중복되는 얇은 페이지를
 * 사이트맵에 실을 이유가 없어서 허브(/town/news)만 STATIC_ROUTES 에 두었다.
 *
 * 2026-08-04 그 전제가 바뀌었다. 상세 페이지가 원문 본문 대신 우리가 새로 쓴
 * 요약 5문장·핵심 4개·FAQ 2개를 싣고 원문은 링크로 보낸다(app/town/news/[id]).
 * 중복도 전재도 아니게 됐으니 색인을 열었고, 사이트맵도 같이 연다.
 *
 * ── 싣는 기준 ─────────────────────────────────────────────────────────
 * 상세 페이지의 색인 조건과 **같은 값**을 쓴다(요약 120자 이상 + 핵심 3개 이상).
 * 조건이 갈리면 사이트맵이 noindex 페이지를 광고하게 된다 — 크롤러에게
 * "보지 말라고 막아 둔 걸 봐 달라"고 보내는 셈이다. 기준을 바꿀 일이 생기면
 * app/town/news/[id]/page.tsx 의 hasOwnNewsContent() 와 **함께** 고친다.
 *
 * lastModified 는 원문 발행 시각을 쓴다 — 추측이 아니라 확인된 시각이다.
 *
 * 조회 실패는 section() 이 던진다. 빈 배열로 바꾸지 않는다(이 파일 상단 주석).
 */
export async function loadNewsEntries(): Promise<MetadataRoute.Sitemap> {
  return section("뉴스 요약", async () => {
    const { getReadOnlySupabase } = await import("@/lib/newui/supabase-read");
    const supabase = getReadOnlySupabase();
    /* 못 읽는 것과 없는 것을 섞지 않는다 — 클라이언트가 없으면 던져서
       자식 라우트가 503 을 내게 한다(빈 <urlset> 200 은 거짓말이다). */
    if (!supabase) {
      throw new Error("Supabase 조회 클라이언트를 만들 수 없습니다");
    }

    const { data, error } = await supabase
      .from("news_articles")
      .select("board_post_id, summary, published_at, created_at, raw_meta")
      .not("board_post_id", "is", null)
      .order("collected_date", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    return (data ?? [])
      .filter((r) => {
        const kp = (r.raw_meta as { seo?: { key_points?: unknown } } | null)?.seo
          ?.key_points;
        return (
          Array.isArray(kp) &&
          kp.length >= 3 &&
          typeof r.summary === "string" &&
          r.summary.trim().length >= 120
        );
      })
      .map((r) => {
        const slug = (r.raw_meta as { seo?: { slug?: string } } | null)?.seo?.slug;
        const path = slug
          ? `/town/news/${encodeURIComponent(slug)}-${r.board_post_id}`
          : `/town/news/${r.board_post_id}`;
        const at = new Date(String(r.published_at ?? r.created_at));
        return {
          url: `${BASE_URL}${path}`,
          ...(Number.isNaN(at.getTime()) ? {} : { lastModified: at }),
          priority: 0.6,
        };
      });
  });
}

/** N14 — 용어 개별 페이지. 코드 상수에서 나오므로 DB 조회도, 실패 경로도 없다.
    lastModified 는 적지 않는다 — 정적 라우트와 같은 이유로, 배포 시각을 런타임에
    알 수 없으니 추측한 날짜를 적느니 생략하는 편이 정확하다. */
export function loadGlossaryEntries(): MetadataRoute.Sitemap {
  return glossaryPaths().map((p) => ({
    url: `${BASE_URL}${p}`,
    priority: 0.4,
  }));
}

/** XML 텍스트 노드 이스케이프 — URL 에 `&` 가 섞여도 파싱이 깨지지 않게 한다. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * MetadataRoute.Sitemap → sitemaps.org XML.
 *
 * 출력 형태는 Next 메타데이터 규약이 내던 것과 같게 맞춘다(요소 순서·줄바꿈 포함).
 * 크롤러가 보는 내용이 라우트 방식 변경만으로 달라지면 안 된다.
 */
export function serializeSitemap(entries: MetadataRoute.Sitemap): string {
  const body = entries
    .map((e) => {
      const parts = [`<loc>${xmlEscape(String(e.url))}</loc>`];
      if (e.lastModified) {
        const at = e.lastModified instanceof Date ? e.lastModified : new Date(e.lastModified);
        if (!Number.isNaN(at.getTime())) parts.push(`<lastmod>${at.toISOString()}</lastmod>`);
      }
      if (typeof e.priority === "number") parts.push(`<priority>${e.priority}</priority>`);
      return `<url>\n${parts.join("\n")}\n</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
