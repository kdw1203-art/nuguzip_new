"use client";

import { NaverMap } from "@/components/map/NaverMapLazy";
import type { MapMarkerData } from "@/components/map/NaverMap";
import { Icon } from "@/app/components/Icon";
import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
  type SeoulDistrictInfo,
} from "@/lib/map/seoul-districts";

/** 지역 기준 실지도 — 정확 좌표 미보유 시 지역명을 좌표로 해석해 네이버 지도로 표시.
 *  SDK 로드 실패(로컬 등) 시에만 지역 요약으로 폴백.
 *
 *  모임 상세 전용(GroupLocationMap)이었는데 `app/town` 아래로 올렸다.
 *  뉴스 상세의 "기사 속 위치"가 같은 일을 해야 하는데도 거기에는
 *  "네이버/카카오 지도 SDK 영역" 이라고 적힌 회색 상자에 지역명 핀 모양을
 *  절대 좌표로 얹어 둔 그림이 들어가 있었다 — 지도처럼 보이지만 지도가 아니고,
 *  핀 위치는 기사와 아무 관계가 없었다. 두 화면이 같은 컴포넌트를 쓰게 한다. */
const DISTRICTS: SeoulDistrictInfo[] = [
  ...SEOUL_DISTRICTS,
  ...METRO_EXPLORE_DISTRICTS,
];
const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };

function resolveDistrict(
  ...parts: (string | null | undefined)[]
): SeoulDistrictInfo | undefined {
  for (const raw of parts) {
    const q = raw?.trim();
    if (!q) continue;
    const hit =
      DISTRICTS.find((d) => d.name === q) ??
      DISTRICTS.find((d) => q.includes(d.name) || d.name.includes(q));
    if (hit) return hit;
  }
  return undefined;
}

export function LocationMap({
  region,
  city,
  district,
  label,
  className = "h-40",
}: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  label: string;
  /** 지도 상자의 높이 등 레이아웃 — 호출부가 정한다 */
  className?: string;
}) {
  const hit = resolveDistrict(district, region, city);
  const center = hit ? { lat: hit.lat, lng: hit.lng } : SEOUL_CENTER;
  const markers: MapMarkerData[] = hit
    ? [
        {
          id: "meet-loc",
          lat: hit.lat,
          lng: hit.lng,
          label: label || hit.name,
          pinColor: "#1d4fd8",
        },
      ]
    : [];

  const fallback = (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bg to-line text-center">
      <div>
        <div className="text-2xl">
          <Icon name="📍" size={24} />
        </div>
        <div className="mt-1 text-[12px] font-bold text-text-1">
          {region || city || "장소 미정"}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`overflow-hidden rounded-xl ${className}`}>
      <NaverMap
        markers={markers}
        center={center}
        level={hit ? 6 : 8}
        showControls={false}
        rounded={false}
        className="h-full w-full"
        fallback={fallback}
      />
    </div>
  );
}
