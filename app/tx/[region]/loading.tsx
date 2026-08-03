import { PageShell } from "../../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 고도화 1 — 실거래 구간 지역 랜딩 스켈레톤 (면적대·가격대 밴드 그리드) */
export default function TxRegionLoading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div>
          <Skeleton className="h-3.5 w-44 rounded" />
          <Skeleton className="mt-2 h-7 w-72 max-w-full rounded-lg" />
          <Skeleton className="mt-2 h-3.5 w-56 max-w-full rounded" />
        </div>

        {Array.from({ length: 2 }).map((_, s) => (
          <div key={s} className="card rounded-2xl p-5">
            <Skeleton className="h-5 w-40 rounded" />
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
