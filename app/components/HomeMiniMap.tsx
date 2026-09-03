"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { getSessionLite } from "@/lib/client/session-lite";
import { getHomePersonal } from "@/lib/client/home-personal";
import { NaverMap } from "@/components/map/NaverMapLazy";
import type { MapMarkerData } from "@/components/map/NaverMap";
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

/** 지도로 넘길 지역 문자열. 표의 `name` 은 "마포구"·"성남시 분당구"처럼 시/도가
 *  빠져 있어서 그대로 넘기면 동명이지역으로 샌다 — search_regions('서구') 는
 *  **인천 서구**를, ('북구') 는 좌표가 null 인 광주 북구를 먼저 돌려준다.
 *  (2026-08-06 RPC 개편 후 재측정해도 그대로다. 동명 시군구가 여러 시도에
 *  실재하니 이름만으로는 원리상 가릴 수 없다 — 시/도를 붙이는 게 해법이다.)
 *  city 가 이미 이름에 붙어 있는 행("인천 중구")도 있으니 중복은 피한다. */
function districtQuery(d: SeoulDistrictInfo): string {
  const city = d.city ?? "서울";
  return d.name.startsWith(city) ? d.name : `${city} ${d.name}`;
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
    /** 지도로 넘길 때 쓰는 시/도 붙은 전체 이름 — 화면 라벨(regionLabel)과 다르다. */
    regionQuery: string | null;
    selectedId: string | null;
  }>({
    center: SEOUL_CENTER,
    level: 8,
    regionLabel: null,
    regionQuery: null,
    selectedId: null,
  });
  /* 캡처 개선(2026-08-04) — 로그인 사용자의 관심지역 마커(시세 칩 실데이터).
     예전엔 배지는 "내 관심지역 · 강남구"인데 마커는 홈 카드 고정 4곳(마포·
     남양주 포함)이라 서로 다른 얘기를 했다. 관심지역+시세가 해석되면 그걸로
     마커를 교체한다. 해석 실패·비로그인이면 종전(홈 카드) 유지. */
  const [personalRegions, setPersonalRegions] = useState<HomeMiniRegion[] | null>(null);
  /* 최적화 11 — 지연 마운트. 네이버 지도 SDK(외부 스크립트)가 홈 첫 페인트에
     같이 실렸다. 카드가 뷰포트 300px 안에 들어올 때만 지도를 마운트한다 —
     그 전에는 같은 크기의 정적 자리(그라데이션)만. 관측 실패(구형 브라우저)
     시 즉시 마운트로 폴백. */
  const [near, setNear] = useState(false);
  const rootElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rootElRef.current;
    if (!el) return;
    if (typeof IntersectionObserver !== "function") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 로그인 시 관심지역으로 중심 이동 (세션/알림 기반) — 실패·비로그인 시 조용히 유지
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 최적화 26 — 공유 세션 조회로 수렴
        const s = await getSessionLite();
        if (!s?.user?.email) return;
        /* 최적화 — 예전엔 여기서 직접 `fetch("/api/home/personal")` 했다. 문제가
           둘이었다. (1) 이 컴포넌트는 모바일·데스크탑 두 벌로 렌더돼서 홈 한
           번에 이 요청이 2회, PersonalHome 까지 합쳐 3회 나갔다(서버에선 매번
           7갈래 조회). (2) 캐시 지정이 없어 `private, max-age=300` 응답을
           브라우저가 5분간 재사용했다 — 공용 PC 에서 앞사람 관심지역·시세가
           뒷사람 지도에 그대로 떴다. 공유 프라미스(no-store)로 둘 다 없앤다. */
        const d = await getHomePersonal<{
          primaryRegion?: string | null;
          regions?: string[] | null;
          preferences?: {
            regions?: Array<{ name: string; regionId: string | null; gu: string }>;
          } | null;
          regionChips?: Record<
            string,
            { price: string; delta: string; tone: "up" | "down" | "flat" }
          > | null;
        }>();
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
          regionQuery: districtQuery(hit),
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

  /* 지도로 넘어갈 때 어느 지역인지 들고 간다.
     예전엔 마커를 눌러도, 하단 바("마포구 주변 실거래·노트를 지도에서")를 눌러도
     전부 맨 `/map` 이었다 — 화면은 특정 지역을 말해 놓고 결과는 늘 같은 수도권
     기본 지도라, 누른 사람 입장에선 아무 일도 안 일어난 것과 같다.

     이름만 넘기지 않고 좌표까지 같이 넘기는 이유는 실측 때문이다. `/map` 은
     `?region=` 을 search_regions 로 푼다(app/map/page.tsx 의 `resolveRegionFocus`).
     이 표의 62개 지역명을 그대로 넣어 봤을 때 **예전엔 20개가 기본 지도로
     떨어졌다** — 18개는 이름이 안 풀렸고(`경기 성남시 분당구`·수원 4구·용인
     3구 등 12개가 0건, `경기 부천시`·`경기 과천시` → **경기 이천시**, 안양·안산
     4개 구 → **경기 안성시**), 나머지 2개(`인천 연수구`·`인천 남동구`)는 행은
     나오는데 좌표가 null 이었다.

     2026-08-06 에 RPC 쪽을 고쳤다(마이그레이션
     20260806141330_search_regions_official_name_match). 지금은 62개가 전부
     의도한 지역으로 풀린다(`경기 부천시` 만 부천 소사구로 — legal_regions 에
     부천시 통합 행이 없다). 그래도 **폴백은 8개에 여전히 걸린다**: 부천시·성남
     수정구·성남 중원구·안산 단원구·안산 상록구·안양 만안구·인천 남동구·인천
     연수구는 이름은 맞게 찾아도 legal_regions 의 lat/lng 가 null 이다. 즉
     20 → 8 로 줄었을 뿐 0 이 아니고, 줄어든 12개도 폴백이 있었으니 그동안
     티가 안 났던 것이다.

     그리고 이 컴포넌트는 이미 정확한 좌표를 들고 있다(같은 표로 마커를 찍는
     중이다). 아는 값을 텍스트로 바꿔 퍼지 검색에 되물을 이유가 없다. 이름은
     라벨·공유용으로 그대로 넘기고, 좌표를 폴백으로 붙인다 — `/map` 은
     search_regions 가 좌표까지 풀리면 그 좌표를, 아니면 여기서 준 좌표를 쓴다. */
  const mapHref = (name: string | null | undefined, coord?: { lat: number; lng: number } | null) => {
    const q = (name ?? "").trim();
    if (!q) return "/map";
    const sp = new URLSearchParams({ region: q });
    if (coord && Number.isFinite(coord.lat) && Number.isFinite(coord.lng)) {
      sp.set("lat", coord.lat.toFixed(6));
      sp.set("lng", coord.lng.toFixed(6));
    }
    return `/map?${sp.toString()}`;
  };
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
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-primary-soft to-line-strong px-4">
      <p className="flex items-center gap-1.5 t-body font-bold text-text-1">
        <Icon name="🗺" size={16} /> 지도를 불러오지 못했어요
      </p>
      <div className="mt-0.5 flex items-center gap-2">
        <Link href="/welcome" className="btn-soft px-3 py-1.5 text-[12px]">
          {focus.regionLabel ? "관심지역 수정" : "관심지역 설정"}
        </Link>
        <Link href={mapHref(focus.regionQuery ?? focus.regionLabel, focus.regionQuery ? focus.center : null)} className="btn-soft px-3 py-1.5 text-[12px]">
          지도 다시 열기 ›
        </Link>
      </div>
    </div>
  );

  return (
    <div
      ref={rootElRef}
      className={`bento hover-rise relative [box-shadow:var(--shadow-sm)] ${
        fallbackActive ? "h-[112px] md:h-[200px]" : className
      }`}
    >
      {/* 지도 (풀블리드) — near 전에는 SDK 를 싣지 않는다(최적화 11) */}
      <div className="absolute inset-0">
        {near ? (
          <NaverMap
            markers={markers}
            center={focus.center}
            level={focus.level}
            fitToMarkers={fitToMarkers}
            showControls={false}
            rounded={false}
            className="h-full w-full"
            /* 누른 마커의 지역을 그대로 넘긴다 — 마커는 자기가 어느 구인지
               알고 있는데(label) 예전엔 그걸 버리고 맨 지도를 열었다. */
            onMarkerClick={(m) => {
              /* 마커는 id 로 표를 되짚어 정확한 이름·좌표를 얻는다 — 말풍선에
                 적힌 라벨(m.label)은 "분당구"처럼 잘려 있어 그대로 넘기면
                 엉뚱한 지역으로 풀린다. */
              const d = findDistrict(m.id) ?? findDistrict(m.label ?? "");
              router.push(
                d ? mapHref(districtQuery(d), { lat: d.lat, lng: d.lng }) : mapHref(m.label),
              );
            }}
            fallback={staticFallback}
            onFallbackChange={setFallbackActive}
          />
        ) : (
          <div
            aria-hidden
            className="h-full w-full bg-gradient-to-br from-primary-soft to-line-strong"
          />
        )}
      </div>

      {/* 폴백일 때는 오버레이(배지·하단 바)를 걷는다 — 축소된 카드 위에
          겹치면 폴백 CTA 를 가린다. 아래 두 블록 공통. */}
      {/* 상단 좌: 관심지역 배지 */}
      {!fallbackActive && (
      <div className="pointer-events-none absolute left-3.5 top-3.5 z-10">
        <span className="glass inline-flex items-center gap-1 rounded-full px-3 py-[6px] text-[12px] font-extrabold text-ink shadow-sm">
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
        href={mapHref(focus.regionQuery ?? focus.regionLabel, focus.regionQuery ? focus.center : null)}
        className="glass press absolute inset-x-3.5 bottom-3.5 z-10 flex items-center justify-between rounded-2xl px-4 py-2.5 transition-colors hover:text-primary"
      >
        {/* 설명이 아니라 **결과**를 적는다. (A08)
            예전 문구는 "…를 지도에서 살펴보세요" — 무엇이 지도에 있는지는 안 말하고
            할 일만 시켰다. 지금 이 지도에 실제로 무엇이 찍혀 있는지 말한다. */}
        <span className="t-body font-semibold text-text-2">
          {markers.length === 0
            ? "지도에 표시할 지역 시세가 아직 없어요"
            : focus.regionLabel
              ? markers.length > 1
                ? `${focus.regionLabel} 외 ${markers.length - 1}곳 평균 시세`
                : `${focus.regionLabel} 평균 시세`
              : `주요 ${markers.length}곳 평균 시세`}
        </span>
        <span className="shrink-0 t-body font-extrabold text-primary">
          지도 열기 ›
        </span>
      </Link>
      )}
    </div>
  );
}
