import { Skeleton } from "@/components/Skeleton";

/* 고도화 1 — 지도 스켈레톤. MapClient 는 전체 화면 커스텀 레이아웃이라
   PageShell 없이 지도 캔버스 + 좌측 패널 자리를 그대로 잡는다. */
export default function MapLoading() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      {/* 지도 캔버스 자리 */}
      <Skeleton className="absolute inset-0 rounded-none" />
      {/* 상단 검색바 자리.
          [E73] 실물 툴바는 h-[58px] · w-[calc(100%-32px)] · max-w-[1180px] 다
          (map-client.tsx). 예전 스켈레톤은 h-11(44px) · 최대 560px 라 높이도
          14px 짧고 폭은 절반이 안 됐다 — 뜨는 순간 화면이 두 번 다시 그려진다. */}
      <div className="absolute left-1/2 top-4 w-[calc(100%-32px)] max-w-[1180px] -translate-x-1/2">
        <Skeleton className="h-[58px] w-full rounded-2xl" />
      </div>
      {/* 좌측 단지 패널 자리 (데스크톱) — 실물은 md:left-[356px] 부터 지도가
          시작하므로 패널 오른쪽 끝이 344px 이 되도록 left-4 + w-[340px] 를 유지한다. */}
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
        className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-[rgba(16,28,54,.72)] px-4 py-2 t-sub font-semibold text-white"
      >
        지도를 불러오는 중…
      </div>
    </div>
  );
}
