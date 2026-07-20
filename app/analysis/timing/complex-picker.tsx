"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ComplexPicker, type PickedComplex } from "../ComplexPicker";

/* 시세·타이밍 단지 선택 — 단지를 고르면 그 지역 regionId로 ?region= 이동
   (서버 재렌더 → 해당 지역 실제 지수 시리즈 로드).
   딥링크 ?complexId=/?apt= 는 ComplexPicker가 해석 후 onSelect 로 넘겨 이동. */
export function TimingComplexPicker({
  initialComplexId,
  initialApt,
  currentRegion,
}: {
  initialComplexId?: string | null;
  initialApt?: string | null;
  currentRegion: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const go = (c: PickedComplex) => {
    if (!c.regionId || c.regionId === currentRegion) return;
    startTransition(() => {
      router.replace(`/analysis/timing?region=${encodeURIComponent(c.regionId!)}`, {
        scroll: false,
      });
    });
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
