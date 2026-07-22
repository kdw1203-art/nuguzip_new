import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 주간 다이제스트 로딩 스켈레톤 (#41) — 헤더 + 섹션별 요약 블록 (단일 컬럼) */
export default function DigestLoading() {
  return (
    <PageShell breadcrumb="주간 다이제스트">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-2.5">
        {/* 헤더 */}
        <Skeleton className="h-7 w-56 max-w-full rounded-lg" />
        <Skeleton className="h-3.5 w-40 rounded" />

        {/* 섹션 블록 3개 (뉴스·시세·커뮤니티) */}
        {Array.from({ length: 3 }).map((_, s) => (
          <div key={s} className="card mt-3 p-[var(--pad-card)]">
            <Skeleton className="h-4 w-24 rounded" />
            <div className="mt-3 flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-full rounded" />
                    <Skeleton className="mt-1.5 h-3 w-2/3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
