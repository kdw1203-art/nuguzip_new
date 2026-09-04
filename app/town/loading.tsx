import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* 동네이야기 로딩 스켈레톤 (#17) — 타이틀 + 카테고리 바로가기 행 + 피드 카드 그리드 */
export default function TownLoading() {
  return (
    <PageShell wide>
      <LoadingHint className="mb-3" />
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <Skeleton className="hidden h-9 w-20 rounded-xl md:block" />
      </div>

      {/* 카테고리 바로가기 카드 행 */}
      <div className="mb-5 flex gap-2.5 overflow-hidden pb-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="card flex w-[96px] shrink-0 flex-col gap-2 rounded-2xl px-4 py-3.5"
          >
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="mt-1 h-3.5 w-10 rounded" />
            <Skeleton className="h-2.5 w-16 rounded" />
          </div>
        ))}
      </div>

      {/* 사진 우선 피드 — 실제 피드는 커버 높이가 카드마다 다른 매소너리다.
          스켈레톤이 4열 균등 격자면 실제 목록이 붙는 순간 리듬이 통째로 바뀐다.
          같은 시드 리듬(짧음·중간·김)을 그대로 흉내 낸다. */}
      <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="card mb-3 break-inside-avoid overflow-hidden rounded-[14px]">
            <Skeleton className={`w-full ${["h-40", "h-56", "h-32", "h-48"][i % 4]}`} />
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
