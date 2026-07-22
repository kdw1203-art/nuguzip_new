import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 정비사업 지도 로딩 스켈레톤 (#41) — 사업종류·진행단계 필터 + 지도 캔버스 + 사업장 목록 */
export default function RedevelopmentLoading() {
  return (
    <PageShell breadcrumb="홈 › 동네이야기 › 정비사업 지도" title="정비사업 지도">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
        {/* 사업종류 필터 칩 */}
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>

        {/* 지도 캔버스 */}
        <Skeleton className="h-[420px] w-full rounded-2xl" />

        {/* 사업장 목록 */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-[var(--pad-card)]">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-32 rounded" />
              </div>
              <Skeleton className="mt-3 h-3 w-2/3 rounded" />
              <Skeleton className="mt-1.5 h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
