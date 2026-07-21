"use client";

import { NaverMap, type MapMarkerData } from "@/components/map/NaverMap";
import { Icon } from "@/app/components/Icon";
import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
  type SeoulDistrictInfo,
} from "@/lib/map/seoul-districts";

/** 모임 장소 실지도 — 정확 좌표 미보유 시 지역명을 좌표로 해석해 네이버 지도로 표시.
 *  SDK 로드 실패(로컬 등) 시에만 지역 요약으로 폴백. */
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

export function GroupLocationMap({
  region,
  city,
  district,
  label,
}: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  label: string;
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
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#eef2f8] to-[#e2e8f2] text-center">
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
    <div className="h-40 overflow-hidden rounded-xl">
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
