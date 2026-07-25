import type { MetadataRoute } from "next";
import { listPublicNotes } from "@/lib/inspection/store-db";
import {
  capSitemapUrls,
  listComplexSitemapEntries,
  periodToDate,
} from "@/lib/seo/sitemap-entries";

/* 사이트맵 — 정적 공개 라우트 + 공개 임장노트 + 단지 허브 + 지역 허브.
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
      사실 주장이 아니므로 유지한다. */

export const dynamic = "force-dynamic";

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  // 1파일 50,000 URL 상한 — 넘치면 잘라내되 경고 로그를 남긴다(인덱스 분할 신호).
  return capSitemapUrls([
    ...staticEntries,
    ...noteEntries,
    ...complexEntries,
    ...regionEntries,
  ]);
}
