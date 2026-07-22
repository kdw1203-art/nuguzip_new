import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 공매·경매 로딩 스켈레톤 (#41) — 소스 탭 + 요약 + 필터 칩 + 섹션 카드 + 물건 목록
   (형제 페이지 /supply 에는 있고 /auctions 에는 없던 로딩 상태 불일치 해소) */
export default function AuctionsLoading() {
  return (
    <PageShell breadcrumb="동네이야기 › 공매·경매" wide>
      {/* 소스 탭 (공매/경매) */}
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>

      <Skeleton className="mb-5 h-4 w-2/3 rounded" />

      {/* 지역·유형 필터 칩 */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>

      {/* 요약 섹션 카드 3열 */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-[var(--pad-card)]">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="mt-3 h-8 w-1/2 rounded" />
            <Skeleton className="mt-2 h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>

      {/* 물건 목록 */}
      <div className="card p-[var(--pad-card)]">
        <Skeleton className="h-4 w-28 rounded" />
        <div className="mt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-1/2 rounded" />
                <Skeleton className="mt-1.5 h-2.5 w-2/3 rounded" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Skeleton className="h-3.5 w-12 rounded" />
                <Skeleton className="h-2.5 w-10 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
