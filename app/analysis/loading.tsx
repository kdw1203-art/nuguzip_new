import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* AI 분석 허브 로딩 스켈레톤 (#17) — 헤딩 + 시작 카드 + 도구 카드 그리드 + 바로가기 칩 */
export default function AnalysisLoading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <Skeleton className="mt-2 h-3.5 w-64 rounded" />
        </div>

        {/* 시작 섹션 카드 */}
        <div className="card flex flex-col gap-3 rounded-[20px] p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-56 rounded" />
            <Skeleton className="h-3 w-72 max-w-full rounded" />
          </div>
          <Skeleton className="h-9 w-32 shrink-0 rounded-xl" />
        </div>

        {/* 분석 도구 카드 그리드 */}
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="card flex flex-col gap-2.5 rounded-[20px] p-[22px]"
            >
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-2/3 rounded" />
              <Skeleton className="mt-1 h-3 w-24 rounded" />
            </div>
          ))}
        </div>

        {/* 최근 분석 바로가기 칩 */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-40 rounded-full" />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
