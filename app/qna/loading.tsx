import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 단지 Q&A 로딩 스켈레톤 (#41) — 검색·필터 + 질문 카드 목록 */
export default function QnaLoading() {
  return (
    <PageShell breadcrumb="홈 › 동네이야기 › 단지 Q&A" title="단지 Q&A">
      {/* 검색 + 정렬 필터 */}
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-10 w-full rounded-xl md:max-w-[360px]" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-full" />
          ))}
        </div>
      </div>

      {/* 질문 카드 목록 */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-[var(--pad-card)]">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-5 w-10 shrink-0 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-3 w-full rounded" />
            <Skeleton className="mt-1.5 h-3 w-2/3 rounded" />
            <div className="mt-3 flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
