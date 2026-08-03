import type { Metadata } from "next";
import { PageShell } from "../components/PageShell";
import { SearchClient } from "./search-client";
import { RecentComplexChips } from "../components/RecentComplexes";

/* ============================================================
   통합 검색 — 단지 + 매물 + 임장노트 + 뉴스
   실제 검색 경험은 클라이언트(SearchClient)에서 /api/search/unified 사용
   ============================================================ */

export const metadata: Metadata = {
  title: "통합 검색",
  description: "단지·매물·임장노트·뉴스를 한 번에 검색하세요.",
  /* 검색 결과 화면은 색인 대상이 아니다(항목 46a) — 내용이 쿼리마다 다르고
     검색엔진 자신의 결과와 경쟁하는 빈 껍데기로 읽힌다. 사이트맵에서도 뺐다. */
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <PageShell title="통합 검색" breadcrumb="검색">
      {/* 고도화 6 잔여 — 최근 본 단지 칩. 기록(RecentComplexRecorder)은 단지
          상세에 이미 있었는데 이 칩을 그리는 화면이 없어 읽기 경로가 끊겨
          있었다. 검색 시작점이 가장 자연스러운 자리다(기록 없으면 미렌더). */}
      <RecentComplexChips className="mb-4" />
      <SearchClient />
    </PageShell>
  );
}
