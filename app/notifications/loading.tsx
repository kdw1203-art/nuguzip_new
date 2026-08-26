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

        {/* 알림 카드 목록 — 실제 카드와 같은 높이(85px)·같은 간격(8px)으로 둔다.
            스켈레톤이 실물보다 낮으면 데이터가 붙는 순간 목록 전체가 밀린다. */}
        <div className="mt-3 flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="card flex h-[85px] gap-2.5 rounded-[14px] px-[15px] py-[13px]"
            >
              <Skeleton className="mt-[6px] h-[34px] w-[34px] shrink-0 rounded-[10px]" />
              <div className="min-w-0 flex-1">
                {/* 제목 13 · 본문 11 · 메타 9 — 카드의 타입 램프를 그대로 흉내낸다 */}
                <Skeleton className="h-[13px] w-3/4 rounded" />
                <Skeleton className="mt-[6px] h-[11px] w-full rounded" />
                <Skeleton className="mt-[7px] h-[9px] w-2/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
