import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [966] 월간 리포트 목록 로딩 스켈레톤 — 실제 페이지(760px 컬럼 · 제목 · 설명
   두 줄 · 연도 소제목 · 한 줄짜리 리포트 행)와 같은 자리를 먼저 잡는다. */
export default function ReportsLoading() {
  return (
    <PageShell breadcrumb="월간 실거래 리포트">
      <div className="mx-auto max-w-[760px]">
        <LoadingHint className="mb-3" />
        <Skeleton className="h-7 w-64 max-w-full rounded-lg" />
        <Skeleton className="mt-3 h-3.5 w-full rounded" />
        <Skeleton className="mt-2 h-3.5 w-3/4 rounded" />

        <div className="mt-6 flex flex-col gap-5">
          <div>
            <Skeleton className="mb-2.5 h-4 w-24 rounded" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="card flex items-center justify-between rounded-2xl px-5 py-4"
                >
                  <Skeleton className="h-4 w-44 max-w-[60%] rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
