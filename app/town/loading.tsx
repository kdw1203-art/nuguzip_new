import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 동네이야기 로딩 스켈레톤 (#17) — 타이틀 + 카테고리 바로가기 행 + 피드 카드 그리드 */
export default function TownLoading() {
  return (
    <PageShell wide>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <Skeleton className="hidden h-9 w-20 rounded-xl md:block" />
      </div>

      {/* 카테고리 바로가기 카드 행 */}
      <div className="mb-5 flex gap-2.5 overflow-hidden pb-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="card flex min-w-[118px] shrink-0 flex-col gap-2 rounded-[16px] px-4 py-3.5"
          >
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="mt-1 h-3.5 w-10 rounded" />
            <Skeleton className="h-2.5 w-16 rounded" />
          </div>
        ))}
      </div>

      {/* 사진 우선 피드 카드 그리드 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card overflow-hidden rounded-2xl">
            <Skeleton className="h-40 w-full" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-3.5 w-full rounded" />
              <Skeleton className="h-3.5 w-2/3 rounded" />
              <Skeleton className="mt-1 h-2.5 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
