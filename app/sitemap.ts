import type { MetadataRoute } from "next";
import { listPublicNotes } from "@/lib/inspection/store-db";

/* 시안 20b — 사이트맵: 정적 공개 라우트 + 공개 임장노트.
   DB 조회 실패(env 미설정 등) 시 정적 라우트만 반환. */

export const dynamic = "force-dynamic";

const BASE_URL = "https://nuguzip.com";

const STATIC_ROUTES: Array<{ path: string; priority: number }> = [
  { path: "", priority: 1 },
  { path: "/notes", priority: 0.9 },
  { path: "/notes/compare", priority: 0.6 },
  { path: "/map", priority: 0.9 },
  { path: "/search", priority: 0.7 },
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
  { path: "/town/market", priority: 0.7 },
  { path: "/town/experts", priority: 0.6 },
  { path: "/town/groups", priority: 0.6 },
  // 서울 단지별 실거래 브라우즈 (국토부 실거래가 기반)
  { path: "/complex/browse", priority: 0.8 },
  // 실매물 (집주인 직접·중개사 등록) + 중개사 제휴 안내
  { path: "/listings", priority: 0.8 },
  { path: "/partners", priority: 0.5 },
  { path: "/calculator", priority: 0.6 },
  { path: "/apply", priority: 0.6 },
  { path: "/digest", priority: 0.6 },
  // 정비사업 추적 라이트 — 단계 안내 + 정비사업 뉴스
  { path: "/redevelopment", priority: 0.6 },
  // 공공 부동산 자료 현황 (KB 시세·공시가격·실거래 연동)
  { path: "/data/records", priority: 0.5 },
  // 아파트 입주 예정 물량(공급 캘린더)
  { path: "/supply", priority: 0.7 },
  // 발견 피드 — 탭바 2번 슬롯·비로그인 랜딩 (감사 P1-11)
  { path: "/discover", priority: 0.8 },
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
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${BASE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.path === "" ? "daily" : "weekly",
    priority: r.priority,
  }));

  let noteEntries: MetadataRoute.Sitemap = [];
  try {
    const notes = await listPublicNotes(200);
    noteEntries = notes
      .filter((n) => n.isPublic)
      .map((n) => ({
        url: `${BASE_URL}/notes/${n.id}`,
        lastModified: n.updatedAt ? new Date(n.updatedAt) : now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
  } catch {
    // env 미설정·조회 실패 시 정적 라우트만 반환
  }

  // 프로그래매틱 SEO(실행과제 CSO-14): 단지 허브 페이지 — 22f-65 SEO 핵심 랜딩
  // #33: 단지 200 → 2000 상향. 사이트맵 1파일 URL 한도(50,000)에 여유가 커서
  // sitemap 인덱스 없이 단일 파일 유지 (2,000 + 정적 + 노트 ≪ 50,000).
  let complexEntries: MetadataRoute.Sitemap = [];
  try {
    const { searchComplexes } = await import("@/lib/complex/complex-store");
    const complexes = await searchComplexes("", undefined, 2000);
    complexEntries = complexes.map((c) => ({
      url: `${BASE_URL}/complex/${c.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
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
    regionEntries = [...snapshots.keys()].map((id) => ({
      url: `${BASE_URL}/region/${id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    // 조회 실패 시 생략
  }

  return [...staticEntries, ...noteEntries, ...complexEntries, ...regionEntries];
}
