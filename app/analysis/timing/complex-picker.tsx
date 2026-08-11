"use client";

import { ComplexPicker, type PickedComplex } from "../ComplexPicker";

/* 시세·타이밍 단지 선택 — 단지를 고르면 그 지역 regionId 를 부모에 알린다.
   ISR 전환(13차) 후에는 서버 재렌더(router.replace) 대신 부모(TimingClient)가
   pushState + CDN 캐시 API 페치로 지역을 갈아끼운다.
   딥링크 ?complexId=/?apt= 는 ComplexPicker 가 해석 후 onSelect 로 넘긴다. */
export function TimingComplexPicker({
  initialComplexId,
  initialApt,
  currentRegion,
  onRegion,
}: {
  initialComplexId?: string | null;
  initialApt?: string | null;
  currentRegion: string;
  onRegion: (regionId: string) => void;
}) {
  const go = (c: PickedComplex) => {
    if (!c.regionId || c.regionId === currentRegion) return;
    onRegion(c.regionId);
  };

  return (
    <div className="w-full md:w-[260px]">
      <ComplexPicker
        label="단지로 지역 찾기"
        placeholder="단지명 검색 (예: 공작아파트)"
        showChip={false}
        initialComplexId={initialComplexId}
        initialApt={initialApt}
        onSelect={go}
      />
    </div>
  );
}
