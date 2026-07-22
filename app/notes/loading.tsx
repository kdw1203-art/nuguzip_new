import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 공개 임장노트 로딩 스켈레톤 (#41) — 헤더 + 필터 칩 + 노트 카드 그리드
   실제 NotesFeedClient 레이아웃(제목·설명 + 필터 3종 + 3열 카드)에 맞춰 헤더 점프 방지 */
export default function NotesLoading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 px-1 md:flex-row md:items-end md:justify-between">
          <div>
            <Skeleton className="h-7 w-40 rounded-lg" />
            <Skeleton className="mt-2 h-3.5 w-64 max-w-full rounded" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-16 rounded-full" />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card overflow-hidden rounded-[20px]">
              <Skeleton className="h-44 w-full" />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-2/3 rounded" />
                <div className="mt-2 flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
