import "server-only";

import type { MetadataRoute } from "next";
import { listPublicNotes } from "@/lib/inspection/store-db";
import { logger } from "@/lib/log";
import {
  capSitemapUrls,
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
  { path: "/notes/compare", priority: 0.6 },
  { path: "/map", priority: 0.9 },
  { path: "/search", priority: 0.7 },
  { path: "/recommend", priority: 0.6 },
  { path: "/analysis", priority: 0.8 },
  { path: "/analysis/compare", priority: 0.6 },
  { path: "/analysis/cycle", priority: 0.6 },
  { path: "/analysis/price", priority: 0.6 },
  { path: "/analysis/scenario", priority: 0.6 },
  { path: "/analysis/timing", priority: 0.6 },
  { path: "/analysis/portfolio", priority: 0.6 },
  { path: "/analysis/switch", priority: 0.6 },
  { path: "/town", priority: 0.8 },
  { path: "/town/news", priority: 0.7 },
  { path: "/town/library", priority: 0.7 },
  { path: "/town/experts", priority: 0.6 },
  { path: "/town/groups", priority: 0.6 },
  // 단지 Q&A (커뮤니티 질문·답변)
  { path: "/qna", priority: 0.6 },
  // 서울 단지별 실거래 브라우즈 (국토부 실거래가 기반)
  { path: "/complex/browse", priority: 0.8 },
  // 지역 × 면적대·가격대 실거래 랜딩 인덱스 (A5) — 하위는 아래 bandEntries 로 개별 등록
  { path: "/tx", priority: 0.8 },
  // 실매물 (집주인 직접·중개사 등록) + 중개사 제휴 안내
  { path: "/listings", priority: 0.8 },
  { path: "/partners", priority: 0.5 },
  { path: "/calculator", priority: 0.6 },
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
  { path: "/safety", priority: 0.4 },
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
  { path: "/login", priority: 0.3 },
  { path: "/signup", priority: 0.3 },
];

/** 블록별 URL 수 — 조용한 누락을 잡기 위한 계측값 */
export type SitemapBlockCounts = {
  static: number;
  notes: number;
  complexes: number;
  regions: number;
  bands: number;
  total: number;
};

export type BuiltSitemap = {
  entries: MetadataRoute.Sitemap;
  counts: SitemapBlockCounts;
};

export async function buildSitemap(): Promise<BuiltSitemap> {
  // 정적 라우트는 배포할 때 바뀐다 — 언제였는지 런타임에서 알 방법이 없으므로
  // lastModified 를 적지 않는다(추측한 날짜보다 없는 편이 정확하다).
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${BASE_URL}${r.path}`,
    priority: r.priority,
  }));

  let noteEntries: MetadataRoute.Sitemap = [];
  try {
    const notes = await listPublicNotes(200);
    noteEntries = notes
      .filter((n) => n.isPublic)
      .map((n) => {
        const at = n.updatedAt ? new Date(n.updatedAt) : null;
        return {
          url: `${BASE_URL}/notes/${n.id}`,
          ...(at && !Number.isNaN(at.getTime()) ? { lastModified: at } : {}),
          priority: 0.7,
        };
      });
  } catch {
    // env 미설정·조회 실패 시 생략
  }

  // 프로그래매틱 SEO 핵심 랜딩 — 실거래가 있는 단지 전체(현재 5,147개).
  let complexEntries: MetadataRoute.Sitemap = [];
  try {
    const complexes = await listComplexSitemapEntries();
    complexEntries = complexes.map((c) => ({
      url: `${BASE_URL}/complex/${c.id}`,
      ...(c.lastModified ? { lastModified: c.lastModified } : {}),
      priority: 0.8,
    }));
  } catch {
    // 조회 실패 시 생략
  }

  // 지역 허브 SEO 페이지 — market_region_price 61개 지역 (/region/[id])
  let regionEntries: MetadataRoute.Sitemap = [];
  try {
    const { getAllRegionSnapshots } = await import("@/lib/market/store");
    const snapshots = await getAllRegionSnapshots();
    regionEntries = [...snapshots.values()].map((s) => {
      const at = periodToDate(s.period);
      return {
        url: `${BASE_URL}/region/${s.regionId}`,
        ...(at ? { lastModified: at } : {}),
        priority: 0.8,
      };
    });
  } catch {
    // 조회 실패 시 생략
  }

  // A5 — 지역 × 면적대·가격대 실거래 랜딩. 거래 10건 이상인 셀만 페이지가 있으므로
  // 여기 실리는 URL 은 전부 실제 데이터가 있는 페이지다(사이트맵에 404 를 넣지 않는다).
  let bandEntries: MetadataRoute.Sitemap = [];
  try {
    const bands = await listBandSitemapEntries();
    bandEntries = bands.map((b) => ({
      url: `${BASE_URL}${b.path}`,
      ...(b.lastModified ? { lastModified: b.lastModified } : {}),
      priority: b.isHub ? 0.7 : 0.6,
    }));
  } catch {
    // 조회 실패 시 생략
  }

  // 1파일 50,000 URL 상한 — 넘치면 잘라내되 경고 로그를 남긴다(인덱스 분할 신호).
  const entries = capSitemapUrls([
    ...staticEntries,
    ...noteEntries,
    ...complexEntries,
    ...regionEntries,
    ...bandEntries,
  ]);

  const counts: SitemapBlockCounts = {
    static: staticEntries.length,
    notes: noteEntries.length,
    complexes: complexEntries.length,
    regions: regionEntries.length,
    bands: bandEntries.length,
    total: entries.length,
  };

  /* 조용한 누락 금지 — 블록이 통째로 비면 경고를 남긴다.
     실제로 이 경고가 있었다면 사이트맵이 5,615 → 403 으로 줄어든 걸 배포 직후
     알 수 있었다. 비는 것 자체는 방어 동작이지 예외가 아니라서 try/catch 로는
     드러나지 않는다. */
  const empty = (Object.keys(counts) as Array<keyof SitemapBlockCounts>).filter(
    (k) => k !== "total" && k !== "notes" && counts[k] === 0,
  );
  if (empty.length > 0) {
    logger.warn(
      `[sitemap] 블록이 비어 있습니다: ${empty.join(", ")} — DB 조회 실패이거나 키가 없습니다. ` +
        `(total=${counts.total}, complexes=${counts.complexes}, regions=${counts.regions}, bands=${counts.bands})`,
    );
  }

  return { entries, counts };
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
