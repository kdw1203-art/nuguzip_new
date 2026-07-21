import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 알림 센터 로딩 스켈레톤 (#17) — 타이틀 + 탭 + 알림 카드 목록 (max-w-560 컬럼) */
export default function NotificationsLoading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[560px]">
        {/* 타이틀 + 우측 액션 */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-20 rounded-lg" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>

        {/* 탭 */}
        <div className="mt-3 flex gap-1.5 overflow-hidden pb-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16 shrink-0 rounded-full" />
          ))}
        </div>

        {/* 알림 카드 목록 */}
        <div className="mt-3 flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="card flex gap-2.5 rounded-[14px] px-[15px] py-[13px]"
            >
              <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-[10px]" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="mt-2 h-2.5 w-1/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
