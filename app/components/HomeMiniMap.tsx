"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
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
  /* 캡처 개선(2026-08-04) — 로그인 사용자의 관심지역 마커(시세 칩 실데이터).
     예전엔 배지는 "내 관심지역 · 강남구"인데 마커는 홈 카드 고정 4곳(마포·
     남양주 포함)이라 서로 다른 얘기를 했다. 관심지역+시세가 해석되면 그걸로
     마커를 교체한다. 해석 실패·비로그인이면 종전(홈 카드) 유지. */
  const [personalRegions, setPersonalRegions] = useState<HomeMiniRegion[] | null>(null);

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
          preferences?: {
            regions?: Array<{ name: string; regionId: string | null; gu: string }>;
          } | null;
          regionChips?: Record<
            string,
            { price: string; delta: string; tone: "up" | "down" | "flat" }
          > | null;
        } | null;
        if (cancelled) return;
        // 관심지역 마커 — 시세 칩이 실재하는 지역만(가격 없는 말풍선 금지)
        const resolved = d?.preferences?.regions ?? [];
        const chips = d?.regionChips ?? null;
        if (chips && resolved.length > 0) {
          const mine: HomeMiniRegion[] = [];
          for (const r of resolved) {
            const chip = r.regionId ? chips[r.regionId] : undefined;
            if (!chip) continue;
            mine.push({
              id: r.regionId!,
              name: r.gu || r.name,
              price: chip.price,
              delta: chip.delta,
              tone: chip.tone,
            });
          }
          if (mine.length > 0) setPersonalRegions(mine);
        }
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

  const shownRegions = personalRegions ?? regions;
  const markers = useMemo<MapMarkerData[]>(() => {
    const out: MapMarkerData[] = [];
    for (const r of shownRegions) {
      const d = findDistrict(r.id) ?? findDistrict(r.name);
      if (!d) continue;
      out.push({
        id: r.id,
        lat: d.lat,
        lng: d.lng,
        label: r.name,
        priceLabel: r.price, // 서버 실데이터 시세 라벨만 표시
        avgPricePerM2: 1, // 시세 말풍선 스타일 플래그(표시값 아님) — 목업 시세 유입 차단
        momPct: toMomPct(r.delta, r.tone),
        infoHtml: "", // 인포윈도우 억제 — 클릭은 지도 열기로
        selected: r.id === focus.selectedId,
        favorite: r.id === focus.selectedId,
      });
    }
    return out;
  }, [shownRegions, focus.selectedId]);

  /* 관심지역 마커로 교체된 경우: 한 곳만 확대(level 11)하면 나머지 관심지역
     마커가 화면 밖이다 — 전체를 프레이밍한다(캡처의 "중앙 빈 지도" 완화). */
  const fitToMarkers =
    (personalRegions !== null && markers.length > 1) ||
    (focus.selectedId === null && markers.length > 1);

  /* 모바일4 — 폴백 카드가 화면 1/4 을 차지하는 빈 공간이었다(캡처).
     폴백이 확정되면 컨테이너를 절반 높이로 줄이고, "준비 중" 안내 대신
     실제로 할 수 있는 행동 두 개(관심지역 설정 /welcome · 지도 열기)를 준다.
     md+ 는 사이드바 폭이라 원래 높이 유지. */
  const [fallbackActive, setFallbackActive] = useState(false);

  const staticFallback = (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#e6ecf9] to-[#cdd9f0] px-4">
      <p className="flex items-center gap-1.5 text-[12px] font-bold text-text-1">
        <Icon name="🗺" size={16} /> 지도를 불러오지 못했어요
      </p>
      <div className="mt-0.5 flex items-center gap-2">
        <Link href="/welcome" className="btn-soft px-3 py-1.5 text-[11px]">
          {focus.regionLabel ? "관심지역 수정" : "관심지역 설정"}
        </Link>
        <Link href="/map" className="btn-soft px-3 py-1.5 text-[11px]">
          지도 다시 열기 ›
        </Link>
      </div>
    </div>
  );

  return (
    <div
      className={`bento hover-rise relative [box-shadow:var(--shadow-sm)] ${
        fallbackActive ? "h-[112px] md:h-[200px]" : className
      }`}
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
          onFallbackChange={setFallbackActive}
        />
      </div>

      {/* 폴백일 때는 오버레이(배지·하단 바)를 걷는다 — 축소된 카드 위에
          겹치면 폴백 CTA 를 가린다. 아래 두 블록 공통. */}
      {/* 상단 좌: 관심지역 배지 */}
      {!fallbackActive && (
      <div className="pointer-events-none absolute left-3.5 top-3.5 z-10">
        <span className="glass inline-flex items-center gap-1 rounded-full px-3 py-[6px] text-[11px] font-extrabold text-ink shadow-sm">
          <Icon name="📍" size={12} />
          내 관심지역
          {focus.regionLabel ? (
            <span className="text-primary"> · {focus.regionLabel}</span>
          ) : (
            <span className="text-text-3"> · 서울</span>
          )}
        </span>
      </div>
      )}

      {/* 하단: 지도 열기 바 (글래스) */}
      {!fallbackActive && (
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
      )}
    </div>
  );
}
