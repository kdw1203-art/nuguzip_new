import { Skeleton } from "@/components/Skeleton";

/* 고도화 1 — 지도 스켈레톤. MapClient 는 전체 화면 커스텀 레이아웃이라
   PageShell 없이 지도 캔버스 + 좌측 패널 자리를 그대로 잡는다. */
export default function MapLoading() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      {/* 지도 캔버스 자리 */}
      <Skeleton className="absolute inset-0 rounded-none" />
      {/* 상단 검색바 자리 */}
      <div className="absolute left-1/2 top-4 w-[min(560px,calc(100vw-32px))] -translate-x-1/2">
        <Skeleton className="h-11 w-full rounded-2xl" />
      </div>
      {/* 좌측 단지 패널 자리 (데스크톱) */}
      <div className="absolute bottom-6 left-4 top-20 hidden w-[340px] flex-col gap-3 md:flex">
        <div className="card flex-1 rounded-2xl p-4">
          <Skeleton className="h-5 w-28 rounded" />
          <div className="mt-3 flex flex-col gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
      <div
        role="status"
        className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-[rgba(16,28,54,.72)] px-4 py-2 text-[12px] font-semibold text-white"
      >
        지도를 불러오는 중…
      </div>
    </div>
  );
}
