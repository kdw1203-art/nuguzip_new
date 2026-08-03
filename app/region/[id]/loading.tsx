import { PageShell } from "../../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 고도화 1 — 지역 랜딩 스켈레톤. 곁다리 7종 조회 동안 흰 화면 방지.
   실제 레이아웃(제목 + 지표 카드 + 시세 차트 자리 + 단지 표)에 맞춘다. */
export default function RegionLoading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div>
          <Skeleton className="h-3.5 w-40 rounded" />
          <Skeleton className="mt-2 h-7 w-56 rounded-lg" />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card rounded-2xl p-4">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="mt-2 h-6 w-24 rounded" />
            </div>
          ))}
        </div>

        <div className="card rounded-2xl p-5">
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="mt-4 h-48 w-full rounded-xl" />
        </div>

        <div className="card rounded-2xl p-5">
          <Skeleton className="h-5 w-36 rounded" />
          <div className="mt-4 flex flex-col gap-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded" />
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
