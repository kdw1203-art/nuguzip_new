import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 입주 예정 물량 로딩 스켈레톤 (#17) — 요약 문구 + 지역 필터 + 월별 차트 + 단지 목록 */
export default function SupplyLoading() {
  return (
    <PageShell
      breadcrumb="홈 › 시장 › 입주 예정 물량"
      title="아파트 입주 예정 물량"
    >
      <Skeleton className="mb-5 h-4 w-3/4 rounded" />

      {/* 지역 필터 칩 */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>

      {/* 월별 물량 차트 */}
      <div className="card mb-6 p-[var(--pad-card)]">
        <Skeleton className="h-4 w-32 rounded" />
        <div className="mt-4 flex h-[120px] items-end gap-[3px]">
          {Array.from({ length: 24 }).map((_, i) => (
            <Skeleton
              key={i}
              className="min-w-[10px] flex-1 rounded-t-[3px]"
              style={{ height: `${20 + ((i * 37) % 80)}px` }}
            />
          ))}
        </div>
      </div>

      {/* 입주 예정 단지 목록 */}
      <div className="card mb-6 p-[var(--pad-card)]">
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
