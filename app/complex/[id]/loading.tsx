import { PageShell } from "../../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 고도화 1 — 단지 상세 스켈레톤. 곁다리 조회(공유 예산 8초)가 도는 동안
   흰 화면 대신 실제 레이아웃(개요 카드 + 시세 표 + 2열 곁다리)을 미리 그린다.
   스켈레톤은 "로딩 중"이라는 사실만 말한다 — 가짜 수치를 그리지 않는다. */
export default function ComplexDetailLoading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        {/* 브레드크럼 + 제목 */}
        <div>
          <Skeleton className="h-3.5 w-48 rounded" />
          <Skeleton className="mt-2 h-7 w-64 max-w-full rounded-lg" />
          <Skeleton className="mt-2 h-3.5 w-40 rounded" />
        </div>

        {/* 개요 지표 카드 4칸 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card rounded-2xl p-4">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="mt-2 h-6 w-24 rounded" />
            </div>
          ))}
        </div>

        {/* 실거래 이력 표 */}
        <div className="card rounded-2xl p-5">
          <Skeleton className="h-5 w-36 rounded" />
          <div className="mt-4 flex flex-col gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded" />
            ))}
          </div>
        </div>

        {/* 곁다리 2열 (이야기·인근 단지) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card rounded-2xl p-5">
              <Skeleton className="h-5 w-28 rounded" />
              <Skeleton className="mt-3 h-3.5 w-full rounded" />
              <Skeleton className="mt-2 h-3.5 w-5/6 rounded" />
              <Skeleton className="mt-2 h-3.5 w-2/3 rounded" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
