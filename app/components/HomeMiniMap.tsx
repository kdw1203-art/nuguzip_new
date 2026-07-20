"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NaverMap, type MapMarkerData } from "@/components/map/NaverMap";
import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
  type SeoulDistrictInfo,
} from "@/lib/map/seoul-districts";

/* 홈 관심지역 실지도 (트렌드 갱신 · #1)
   - 서버(page.tsx)에서 계산한 홈 시세 카드(regions)를 좌표에 매핑해 시세 말풍선 마커로 표시
   - 로그인 시 /api/home/personal 의 관심지역으로 지도 중심 이동(세션 기반) — 실패/비로그인 시 서울 기본
   - SDK/ENV 미가용 시 NaverMap 내장 폴백 대신 브랜드 정적 상태(fallback prop)로 우아하게 대체
   - 마커 클릭·"지도 열기" → /map (경량 게이트웨이) */

export type HomeMiniRegion = {
  id: string;
  name: string;
  /** "32.5억" */
  price: string;
  /** "▼ 4.2%" */
  delta: string;
  tone: "up" | "down" | "flat";
};

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };

/** id·name 양방향 조회용 좌표 인덱스 (서울 25구 + 수도권) */
const DISTRICTS: SeoulDistrictInfo[] = [
  ...SEOUL_DISTRICTS,
  ...METRO_EXPLORE_DISTRICTS,
];

function findDistrict(idOrName: string): SeoulDistrictInfo | undefined {
  const q = idOrName.trim();
  if (!q) return undefined;
  // 1) id 정확 일치 → 2) name 정확 일치 → 3) 부분 포함(관심지역 "서울 마포구" 등)
  return (
    DISTRICTS.find((d) => d.id === q) ??
    DISTRICTS.find((d) => d.name === q) ??
    DISTRICTS.find((d) => q.includes(d.name) || d.name.includes(q))
  );
}

/** "▼ 4.2%" + tone → momPct (상승=+ / 하락=- · 부동산 관례 색상 유지) */
function toMomPct(delta: string, tone: HomeMiniRegion["tone"]): number | undefined {
  const m = /([0-9]+(?:\.[0-9]+)?)/.exec(delta);
  if (!m) return undefined;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return undefined;
  if (tone === "flat") return 0;
  return tone === "down" ? -v : v;
}

export function HomeMiniMap({
  regions,
  className = "",
}: {
  regions: HomeMiniRegion[];
  className?: string;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState<{
    center: { lat: number; lng: number };
    level: number;
    regionLabel: string | null;
    selectedId: string | null;
  }>({ center: SEOUL_CENTER, level: 8, regionLabel: null, selectedId: null });

  // 로그인 시 관심지역으로 중심 이동 (세션/알림 기반) — 실패·비로그인 시 조용히 유지
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sRes = await fetch("/api/auth/session");
        if (!sRes.ok) return;
        const s = (await sRes.json().catch(() => null)) as {
          user?: { email?: string | null };
        } | null;
        if (!s?.user?.email) return;
        const pRes = await fetch("/api/home/personal");
        if (!pRes.ok) return;
        const d = (await pRes.json().catch(() => null)) as {
          primaryRegion?: string | null;
          regions?: string[] | null;
        } | null;
        const label =
          d?.primaryRegion?.trim() ||
          (d?.regions && d.regions.length > 0 ? d.regions[0] : null);
        if (!label) return;
        const hit = findDistrict(label);
        if (cancelled || !hit) return;
        setFocus({
          center: { lat: hit.lat, lng: hit.lng },
          level: 11,
          regionLabel: hit.name,
          selectedId: hit.id,
        });
      } catch {
        /* 비로그인·오류 → 기본(서울) 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markers = useMemo<MapMarkerData[]>(() => {
    const out: MapMarkerData[] = [];
    for (const r of regions) {
      const d = findDistrict(r.id) ?? findDistrict(r.name);
      if (!d) continue;
      out.push({
        id: r.id,
        lat: d.lat,
        lng: d.lng,
        label: r.name,
        priceLabel: r.price,
        avgPricePerM2: d.avgPricePerM2, // 정의되어야 시세 말풍선 마커로 렌더
        momPct: toMomPct(r.delta, r.tone),
        infoHtml: "", // 인포윈도우 억제 — 클릭은 지도 열기로
        selected: r.id === focus.selectedId,
        favorite: r.id === focus.selectedId,
      });
    }
    return out;
  }, [regions, focus.selectedId]);

  // 관심지역 포커스가 없으면 마커 전체를 프레이밍
  const fitToMarkers = focus.selectedId === null && markers.length > 1;

  const staticFallback = (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#e6ecf9] to-[#cdd9f0]">
      <span className="text-2xl" aria-hidden>
        🗺️
      </span>
      <p className="text-[12px] font-bold text-text-1">지도를 준비 중이에요</p>
      <p className="px-6 text-center text-[10px] leading-snug text-text-3">
        관심지역 시세를 지도에서 바로 확인하세요
      </p>
      <Link href="/map" className="btn-soft mt-1 px-3 py-1.5 text-[11px]">
        전체 지도 열기 ›
      </Link>
    </div>
  );

  return (
    <div
      className={`bento hover-rise relative [box-shadow:var(--shadow-sm)] ${className}`}
    >
      {/* 지도 (풀블리드) */}
      <div className="absolute inset-0">
        <NaverMap
          markers={markers}
          center={focus.center}
          level={focus.level}
          fitToMarkers={fitToMarkers}
          showControls={false}
          rounded={false}
          className="h-full w-full"
          onMarkerClick={() => router.push("/map")}
          fallback={staticFallback}
        />
      </div>

      {/* 상단 좌: 관심지역 배지 */}
      <div className="pointer-events-none absolute left-3.5 top-3.5 z-10">
        <span className="glass inline-flex items-center gap-1 rounded-full px-3 py-[6px] text-[11px] font-extrabold text-ink shadow-sm">
          📍 내 관심지역
          {focus.regionLabel ? (
            <span className="text-primary"> · {focus.regionLabel}</span>
          ) : (
            <span className="text-text-3"> · 서울</span>
          )}
        </span>
      </div>

      {/* 하단: 지도 열기 바 (글래스) */}
      <Link
        href="/map"
        className="glass press absolute inset-x-3.5 bottom-3.5 z-10 flex items-center justify-between rounded-2xl px-4 py-2.5 transition-colors hover:text-primary"
      >
        <span className="text-[12px] font-semibold text-text-2">
          {focus.regionLabel
            ? `${focus.regionLabel} 주변 실거래·노트를 지도에서`
            : "관심지역 실거래·노트를 지도에서 살펴보세요"}
        </span>
        <span className="shrink-0 text-[12px] font-extrabold text-primary">
          지도 열기 ›
        </span>
      </Link>
    </div>
  );
}
