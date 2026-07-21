import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 통합 검색 로딩 스켈레톤 (#17) — 큰 검색 입력 + 최근/인기 검색 칩 */
export default function SearchLoading() {
  return (
    <PageShell title="통합 검색" breadcrumb="검색">
      <div className="flex flex-col gap-4">
        {/* 검색 입력 박스 */}
        <Skeleton className="h-[52px] w-full max-w-[560px] rounded-2xl" />

        {/* 최근·인기 검색 칩 */}
        <div className="mt-2 flex flex-col gap-5">
          {Array.from({ length: 2 }).map((_, s) => (
            <div key={s}>
              <Skeleton className="mb-2 h-3 w-16 rounded" />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: s === 0 ? 5 : 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-16 rounded-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
