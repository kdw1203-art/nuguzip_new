import type { Metadata } from "next";
import { PageShell } from "../components/PageShell";
import { SearchClient } from "./search-client";

/* ============================================================
   통합 검색 — 단지 + 매물 + 임장노트 + 뉴스
   실제 검색 경험은 클라이언트(SearchClient)에서 /api/search/unified 사용
   ============================================================ */

export const metadata: Metadata = {
  title: "통합 검색",
  description: "단지·매물·임장노트·뉴스를 한 번에 검색하세요.",
};

export default function SearchPage() {
  return (
    <PageShell title="통합 검색" breadcrumb="검색">
      <SearchClient />
    </PageShell>
  );
}
