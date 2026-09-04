import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* AI 분석 허브 로딩 스켈레톤 — [958] 실제 배치(네이비 히어로 + 검색 카드 + 계열 3개 ×
   4칸 그리드)와 같은 모양. 예전 스켈레톤은 개편 전 배치(6칸 3열)를 그려서 매 진입마다
   틀린 뼈대가 한 번 번쩍였다. */
export default function AnalysisLoading() {
  return (
    <PageShell>
      <LoadingHint className="mb-3" />
      <div className="flex flex-col gap-6">
        <div className="hub-hero card-pad-lg flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-32 rounded bg-on-dark-faint" />
            <Skeleton className="h-7 w-72 max-w-full rounded-lg bg-on-dark-faint" />
            <Skeleton className="h-3.5 w-96 max-w-full rounded bg-on-dark-faint" />
          </div>
          <div className="card rounded-2xl p-3.5">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="mt-3 h-3 w-64 max-w-full rounded" />
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-on-dark-faint pt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-20 rounded bg-on-dark-faint" />
                <Skeleton className="h-3 w-24 rounded bg-on-dark-faint" />
              </div>
            ))}
          </div>
        </div>

        {Array.from({ length: 3 }).map((_, t) => (
          <div key={t} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-[10px]" />
              <Skeleton className="h-5 w-56 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card flex flex-col gap-2 rounded-[14px] p-3.5">
                  <Skeleton className="h-12 w-12 rounded-[10px]" />
                  <Skeleton className="h-4 w-28 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-2/3 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
