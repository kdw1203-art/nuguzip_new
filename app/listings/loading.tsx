import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 실매물 로딩 스켈레톤 (#41) — 제목·요약 + 필터 칩 + 매물 카드 그리드 */
export default function ListingsLoading() {
  return (
    <PageShell breadcrumb="홈 › 실매물">
      <Skeleton className="h-7 w-32 rounded-lg" />
      <Skeleton className="mt-2 h-3.5 w-72 max-w-full rounded" />

      {/* 필터 칩 */}
      <div className="my-5 flex flex-wrap gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>

      {/* 매물 카드 그리드 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card overflow-hidden rounded-[18px]">
            <Skeleton className="h-40 w-full" />
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-24 rounded" />
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-2/3 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
