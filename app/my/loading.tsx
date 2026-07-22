import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 마이 로딩 스켈레톤 (#41) — 프로필 헤더 + 지표 카드 + 활동 목록 */
export default function MyLoading() {
  return (
    <PageShell breadcrumb="마이">
      <div className="mx-auto flex max-w-[860px] flex-col gap-4">
        {/* 프로필 헤더 카드 */}
        <div className="card flex items-center gap-4 p-[var(--pad-card)]">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-32 rounded" />
            <Skeleton className="mt-2 h-3.5 w-48 max-w-full rounded" />
          </div>
          <Skeleton className="hidden h-9 w-24 rounded-xl md:block" />
        </div>

        {/* 지표 카드 3열 */}
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-[var(--pad-card)]">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="mt-2 h-7 w-12 rounded" />
            </div>
          ))}
        </div>

        {/* 활동/노트 목록 */}
        <div className="card p-[var(--pad-card)]">
          <Skeleton className="h-4 w-28 rounded" />
          <div className="mt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-1/2 rounded" />
                  <Skeleton className="mt-1.5 h-2.5 w-2/3 rounded" />
                </div>
                <Skeleton className="h-3.5 w-12 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
