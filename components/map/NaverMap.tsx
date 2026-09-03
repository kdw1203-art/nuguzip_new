"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  declutterMarkers,
  type DeclutterBounds,
  type DeclutterItem,
} from "@/lib/map/declutter";
import {
  NAVER_MAP_AUTH_FAILURE_MESSAGE,
  NAVER_MAP_CLIENT_ID,
  NAVER_MAP_MAX_ZOOM,
  NAVER_MAP_MIN_ZOOM,
  applyNaverMapControlPositions,
  buildNaverMapInitOptions,
  getNaverMapsWindow,
  mapLevelToNaverZoom,
  loadNaverMapsScript,
  type NaverInfoWindow,
  type NaverLayer,
  type NaverMapInstance,
  type NaverMarker,
} from "@/lib/map/naver-maps-sdk";
import { cn } from "@/lib/utils";
import { Icon } from "@/app/components/Icon";

export interface MapMarkerData {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** 평균 매매가(원) — 목록·패널과 동일 */
  avgPriceWon?: number;
  /** 목록과 동일한 시세 라벨 (예: 7.8억) */
  priceLabel?: string;
  avgPricePerM2?: number;
  momPct?: number;
  tradeCount30d?: number;
  infoHtml?: string;
  /** 마커 핀 색 (HTML 마커) */
  pinColor?: string;
  /**
   * 클러스터 알약 라벨의 글자색. C1 시세 색상 오버레이는 옅은 노랑~진한 빨강까지
   * 배경 명도가 크게 벌어져서, 흰 글자 하나로는 옅은 칸에서 읽히지 않는다.
   * 지정하지 않으면 기존대로 흰색.
   */
  pinTextColor?: string;
  /** 시세 말풍선 강조색 (마커 색상 단계 = 가격대 히트) */
  tierColor?: string;
  /** 관심 단지(★) */
  favorite?: boolean;
  /** 선택 상태(목록에서 클릭 등) */
  selected?: boolean;
  /**
   * 시세 말풍선에 단지명을 함께 적을지. 단지 줌에서만 켠다 —
   * 넓은 줌에서 켜면 이름이 서로 겹쳐 지도가 글자로 덮인다.
   */
  showName?: boolean;
  /* ── 아래는 마커를 누르기 전 호버 카드에 쓰는 값들 ────────────────── */
  households?: number;
  buildYear?: number;
  avgAreaM2?: number;
  regionName?: string;
}

type MarkerEntry = {
  marker: NaverMarker;
  data: MapMarkerData;
  signature: string;
};

/**
 * 마커 외형/위치에 영향을 주는 필드만 직렬화해 증분 갱신 판단에 쓴다.
 * collapsed(라벨 접힘)도 외형을 바꾸므로 여기에 포함해야 한다 — 빠뜨리면
 * 겹침 정리 결과가 화면에 반영되지 않고 조용히 무시된다.
 */
function markerSignature(d: MapMarkerData, collapsed = false): string {
  return [
    d.lat,
    d.lng,
    d.label,
    d.pinColor ?? "",
    d.pinTextColor ?? "",
    d.tierColor ?? "",
    d.avgPriceWon ?? "",
    d.priceLabel ?? "",
    d.avgPricePerM2 ?? "",
    d.momPct ?? "",
    d.favorite ? 1 : 0,
    d.selected ? 1 : 0,
    d.showName ? 1 : 0,
    collapsed ? 1 : 0,
  ].join(":");
}

/* ── 라벨 실측 ────────────────────────────────────────────────────────────
   말풍선 폭을 글자 수 × 상수로 어림하면 한글·숫자·기호가 섞인 라벨에서 크게
   빗나간다(실제로 대조해 보니 17% 어긋났다). 겹침 판정의 입력이 17% 틀리면
   판정 자체가 틀린 것이므로, 브라우저가 쓰는 것과 같은 폰트로 canvas 에
   재서 쓴다. canvas 를 못 쓰는 환경에서만 어림값으로 내려간다. */
let measureCtx: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string, font: string, fallbackPerChar: number): number {
  if (!text) return 0;
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement("canvas").getContext("2d");
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return text.length * fallbackPerChar;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

export interface MapIdleInfo {
  zoom: number;
  center: { lat: number; lng: number };
  bounds: { swLat: number; swLng: number; neLat: number; neLng: number } | null;
}

export type NaverNativeLayers = {
  traffic?: boolean;
  cadastral?: boolean;
  bicycle?: boolean;
};

interface NaverMapProps {
  markers?: MapMarkerData[];
  center?: { lat: number; lng: number };
  /** level(1~14) — 내부에서 네이버 zoom으로 변환 */
  level?: number;
  className?: string;
  onMarkerClick?: (marker: MapMarkerData) => void;
  /** 공식 예제 — 줌·지도유형·축척 컨트롤 */
  showControls?: boolean;
  /** 공식 예제 — TrafficLayer / CadastralLayer / BicycleLayer */
  nativeLayers?: NaverNativeLayers;
  /** 마커가 2개 이상이면 fitBounds */
  fitToMarkers?: boolean;
  /** HTML5 Geolocation — 내 위치 버튼 */
  enableGeolocation?: boolean;
  /** 내 위치 버튼 위치 */
  /** bottom-right 는 /map 전용 — 모바일 탭바(하단 플로팅) 위로 띄운다 */
  geolocationButtonPosition?: "top-right" | "bottom-left" | "bottom-right";
  /** 지도 유형 — 일반/위성 */
  mapType?: "normal" | "satellite";
  /** 지도 이동/줌이 멈추면 현재 영역·줌을 알린다 */
  onIdle?: (info: MapIdleInfo) => void;
  /** false면 모서리 라운드 없음 (풀스크린 /explore) */
  rounded?: boolean;
  /** SDK 로드 실패·Client ID 미설정 시 대신 렌더할 노드 (미지정 시 OSM 폴백) */
  fallback?: React.ReactNode;
  /** 폴백 상태 통지(모바일4) — 부모가 폴백일 때 컨테이너를 줄이는 용도.
      실패가 확정된 시점(error 세팅)에 true 로 한 번 불린다. */
  onFallbackChange?: (active: boolean) => void;
  /** 반경 원 오버레이(C3) — 지정 시 중심·반경(m)으로 원을 그린다. null/미지정 시 없음. */
  circle?: { lat: number; lng: number; radiusM: number } | null;
  /**
   * 지도 빈 곳 클릭 좌표. 반경 중심을 찍거나 거리 재기 지점을 찍는 데 쓴다.
   * 마커 클릭은 마커 자신의 핸들러가 먼저 받으므로 여기로 오지 않는다.
   */
  onMapClick?: (point: { lat: number; lng: number }) => void;
  /**
   * 거리 재기 오버레이 — 찍은 지점들을 잇는 선과 지점 표시.
   * 구간 길이는 화면 쪽(map-client)에서 계산해 라벨로 넘긴다.
   */
  measurePath?: {
    lat: number;
    lng: number;
    label?: string;
    selected?: boolean;
  }[] | null;
  /** 지점 드래그 종료 — 거리/반경 편집용 */
  onMeasurePointDragEnd?: (index: number, point: { lat: number; lng: number }) => void;
  /** 지점 클릭(선택) */
  onMeasurePointClick?: (index: number) => void;
  /**
   * 추가 경로 오버레이 — 차량·도보 등 점선 경로.
   * dashed 면 strokeStyle shortdash.
   */
  routeOverlays?: {
    id: string;
    path: { lat: number; lng: number }[];
    color: string;
    dashed?: boolean;
    strokeWeight?: number;
    strokeOpacity?: number;
  }[] | null;
  /** 반경 중심 드래그 */
  onRadiusCenterDragEnd?: (point: { lat: number; lng: number }) => void;
  /** 반경 가장자리 핸들 드래그 → 새 반경(m) */
  onRadiusEdgeDragEnd?: (radiusM: number) => void;
  /** 클릭으로 지점을 찍는 모드일 때 커서를 십자로 바꾼다. */
  crosshair?: boolean;
  /**
   * 마커에 커서를 올렸을 때(벗어나면 null). 누르기 전에 단지 요약을 띄우는 데 쓴다.
   * 위치는 화면 쪽에서 포인터를 따라 잡는다 — 지도 투영 좌표 변환을 거치지 않는다.
   */
  onMarkerHover?: (marker: MapMarkerData | null) => void;
  /**
   * 말풍선 겹침 정리. 켜면 서로 겹치는 시세 말풍선 중 우선순위가 낮은 쪽의
   * 라벨을 점으로 접는다(마커는 남으므로 계속 누를 수 있다).
   * 기본은 꺼짐 — 지금 이 동작이 필요한 화면은 /map 뿐이고, 다른 화면의
   * 지도까지 조용히 바꾸지 않기 위해서다.
   */
  declutter?: boolean;
  /** 라벨 최대 개수(0 이하면 상한 없음). 겹치지 않아도 100개를 읽지는 않는다. */
  declutterMaxLabels?: number;
}

/** naver.maps.Circle 최소 인터페이스 */
type NaverCircle = {
  setMap: (m: unknown | null) => void;
  setCenter: (c: unknown) => void;
  setRadius: (r: number) => void;
};

export function NaverMap({
  markers = [],
  center = { lat: 37.5665, lng: 126.978 },
  level = 8,
  className = "",
  onMarkerClick,
  showControls = true,
  nativeLayers,
  fitToMarkers = false,
  enableGeolocation = false,
  geolocationButtonPosition = "top-right",
  mapType = "normal",
  onIdle,
  rounded = true,
  fallback,
  onFallbackChange,
  circle = null,
  onMapClick,
  measurePath = null,
  onMeasurePointDragEnd,
  onMeasurePointClick,
  routeOverlays = null,
  onRadiusCenterDragEnd,
  onRadiusEdgeDragEnd,
  crosshair = false,
  onMarkerHover,
  declutter = false,
  declutterMaxLabels = 0,
}: NaverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  /* 모바일4 — 폴백 확정을 부모에게 알린다(성공 로드로 회복되면 false).
     render 중 부모 setState 금지라 effect 로 미룬다. */
  useEffect(() => {
    onFallbackChange?.(error !== "");
  }, [error, onFallbackChange]);
  const [geoLoading, setGeoLoading] = useState(false);
  const mapRef = useRef<NaverMapInstance | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;
  const markerMapRef = useRef<Map<string, MarkerEntry>>(new Map());
  const prevIdKeyRef = useRef("");
  const infoWindowRef = useRef<NaverInfoWindow | null>(null);
  const trafficLayerRef = useRef<NaverLayer | null>(null);
  const cadastralLayerRef = useRef<NaverLayer | null>(null);
  const circleRef = useRef<NaverCircle | null>(null);
  const circlePropRef = useRef(circle);
  circlePropRef.current = circle;
  const bicycleLayerRef = useRef<NaverLayer | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onMarkerHoverRef = useRef(onMarkerHover);
  onMarkerHoverRef.current = onMarkerHover;
  const onMeasurePointDragEndRef = useRef(onMeasurePointDragEnd);
  onMeasurePointDragEndRef.current = onMeasurePointDragEnd;
  const onMeasurePointClickRef = useRef(onMeasurePointClick);
  onMeasurePointClickRef.current = onMeasurePointClick;
  const onRadiusCenterDragEndRef = useRef(onRadiusCenterDragEnd);
  onRadiusCenterDragEndRef.current = onRadiusCenterDragEnd;
  const onRadiusEdgeDragEndRef = useRef(onRadiusEdgeDragEnd);
  onRadiusEdgeDragEndRef.current = onRadiusEdgeDragEnd;
  const measureLineRef = useRef<(NaverLayer & { setPath?: (p: unknown[]) => void }) | null>(null);
  const measureMarkersRef = useRef<NaverMarker[]>([]);
  const routeLinesRef = useRef<NaverLayer[]>([]);
  const radiusCenterMarkerRef = useRef<NaverMarker | null>(null);
  const radiusEdgeMarkerRef = useRef<NaverMarker | null>(null);
  /** 드래그 직후 click 이 한 번 더 오는 경우 지점 추가를 막는다 */
  const suppressMapClickUntilRef = useRef(0);
  /* 겹침 정리 입력 — 실제 bounds 와 컨테이너 픽셀 크기. idle 때 갱신한다.
     declutter 가 꺼져 있으면 갱신하지 않아 리렌더도 늘지 않는다. */
  const [mapView, setMapView] = useState<{
    bounds: DeclutterBounds | null;
    width: number;
    height: number;
  }>({ bounds: null, width: 0, height: 0 });
  const declutterRef = useRef(declutter);
  declutterRef.current = declutter;

  useEffect(() => {
    if (!NAVER_MAP_CLIENT_ID) {
      queueMicrotask(() =>
        setError(
          "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID 가 설정되지 않았습니다. .env.local 에 추가해 주세요.",
        ),
      );
      return;
    }
    if (typeof window === "undefined") return;

    let cancelled = false;
    // 런타임 Client ID 우선 — 빌드 시 env 마스킹("[SENSITIVE]")으로 번들에
    // 폴백 상수가 박혀도, 서버 런타임의 실값(/api/map/sdk-config)으로 로드한다.
    const resolveRuntimeClientId = async (): Promise<string> => {
      try {
        const res = await fetch("/api/map/sdk-config", { cache: "force-cache" });
        if (res.ok) {
          const data = (await res.json()) as { ncpKeyId?: string };
          const id = data.ncpKeyId?.trim();
          if (id && /^[a-z0-9]{6,24}$/i.test(id)) return id;
        }
      } catch {
        // 네트워크 실패 시 번들 상수로 폴백
      }
      return NAVER_MAP_CLIENT_ID;
    };
    void resolveRuntimeClientId().then((clientId) => {
      if (cancelled) return;
      return loadNaverMapsScript(clientId, {
      onAuthFailure: () => {
        if (cancelled) return;
        // 인증 실패의 가장 흔한 원인은 "현재 접속 origin 미등록"이라 실제 origin을 노출한다.
        let detail = NAVER_MAP_AUTH_FAILURE_MESSAGE;
        if (typeof window !== "undefined") {
          const origin = window.location.origin;
          const hostname = window.location.hostname;
          const host = `${window.location.protocol}//${hostname}`;
          const isVercelPreview = hostname.endsWith(".vercel.app");
          const isLoopback = hostname === "localhost" || hostname === "127.0.0.1";
          const isLan = /^\d+\.\d+\.\d+\.\d+$/.test(hostname) && hostname !== "127.0.0.1";
          detail =
            `네이버 지도 인증 실패. 현재 접속 주소(${origin})가 NCP에 등록되지 않았을 수 있어요. ` +
            `NCP 콘솔 > Maps > Application > "Web 서비스 URL"에 ${host} 를 등록하세요(포트·경로 제외).` +
            (isVercelPreview
              ? " ⚠ 지금 *.vercel.app 미리보기 URL로 보고 있습니다 — https://naezipnow.com 으로 접속하거나 이 미리보기 도메인도 등록해야 합니다."
              : "") +
            (isLoopback
              ? ` ⚠ NCP는 http://localhost 와 http://127.0.0.1 을 서로 다른 주소로 봅니다. VS Code Live Preview 등은 127.0.0.1 로 뜨므로 둘 다 등록하세요(지금은 ${host}).`
              : "") +
            (isLan
              ? " ⚠ 192.168.x.x 같은 네트워크 IP로 접속 중입니다 — http://localhost, http://127.0.0.1 또는 이 IP를 등록해야 합니다."
              : "");
        }
        setError(detail);
      },
      })
        .then(() => {
          if (!cancelled) setLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setError("네이버 지도 SDK 로드 실패");
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 워치독 — 어떤 이유로든 SDK 로드가 끝내 settle 되지 않아도 스피너가 영구 지속되지 않도록
  // 일정 시간 후 강제로 에러 상태로 전환해 OSM 폴백을 띄운다. (SDK 내부 타임아웃의 백스톱)
  useEffect(() => {
    if (loaded || error || !NAVER_MAP_CLIENT_ID) return;
    const timer = window.setTimeout(() => {
      if (!mapRef.current) {
        setError(
          "네이버 지도 로딩이 지연됩니다. 네트워크 상태와 NCP 'Web 서비스 URL'(현재 접속 도메인) 등록 여부를 확인해 주세요.",
        );
      }
    }, 16_000);
    return () => window.clearTimeout(timer);
  }, [loaded, error]);

  useEffect(() => {
    if (!loaded || !containerRef.current || mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    if (!maps) return;

    const latlng = new maps.LatLng(center.lat, center.lng);
    const initOpts = applyNaverMapControlPositions(
      buildNaverMapInitOptions(latlng, level, { showControls }),
      maps,
    );
    mapRef.current = new maps.Map(containerRef.current, initOpts);
  }, [loaded, showControls]);

  // 언마운트 시 오버레이·맵 정리(메모리 누수/중복 방지)
  useEffect(() => {
    return () => {
      for (const [, entry] of markerMapRef.current) entry.marker.setMap(null);
      markerMapRef.current.clear();
      infoWindowRef.current?.close();
      trafficLayerRef.current?.setMap(null);
      cadastralLayerRef.current?.setMap(null);
      bicycleLayerRef.current?.setMap(null);
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !mapRef.current || !containerRef.current) return;
    const map = mapRef.current;
    const el = containerRef.current;

    const ro = new ResizeObserver(() => {
      map.refresh?.();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    if (!maps) return;

    mapRef.current.setCenter(new maps.LatLng(center.lat, center.lng));
    mapRef.current.setZoom(
      Math.min(NAVER_MAP_MAX_ZOOM, Math.max(NAVER_MAP_MIN_ZOOM, mapLevelToNaverZoom(level))),
    );
  }, [loaded, center.lat, center.lng, level]);

  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    if (!maps) return;
    const map = mapRef.current;

    const toggleLayer = (
      ref: React.MutableRefObject<NaverLayer | null>,
      LayerCtor: new () => NaverLayer,
      enabled?: boolean,
    ) => {
      if (enabled) {
        if (!ref.current) ref.current = new LayerCtor();
        ref.current.setMap(map);
      } else {
        ref.current?.setMap(null);
      }
    };

    toggleLayer(trafficLayerRef, maps.TrafficLayer, nativeLayers?.traffic);
    toggleLayer(cadastralLayerRef, maps.CadastralLayer, nativeLayers?.cadastral);
    toggleLayer(bicycleLayerRef, maps.BicycleLayer, nativeLayers?.bicycle);
  }, [loaded, nativeLayers?.traffic, nativeLayers?.cadastral, nativeLayers?.bicycle]);

  // 지도 유형 (일반/위성)
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    const ids = maps?.MapTypeId;
    if (!ids || !mapRef.current.setMapTypeId) return;
    mapRef.current.setMapTypeId(mapType === "satellite" ? ids.HYBRID : ids.NORMAL);
  }, [loaded, mapType]);

  // 지도 이동/줌 종료 → onIdle 콜백 (bounds + zoom + center)
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    if (!maps) return;
    const map = mapRef.current;

    const emit = () => {
      const cb = onIdleRef.current;
      const zoom = map.getZoom?.() ?? 0;
      const c = map.getCenter?.();
      const b = map.getBounds?.();
      const sw = b?.getSW?.();
      const ne = b?.getNE?.();

      /* 겹침 정리용 화면 상태. 값이 실제로 달라졌을 때만 setState 한다 —
         idle 이 같은 값으로 여러 번 와도 리렌더가 늘지 않게. */
      if (declutterRef.current) {
        const el = containerRef.current;
        const width = el?.clientWidth ?? 0;
        const height = el?.clientHeight ?? 0;
        const bounds =
          sw && ne
            ? { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() }
            : null;
        setMapView((prev) => {
          const same =
            prev.width === width &&
            prev.height === height &&
            prev.bounds?.swLat === bounds?.swLat &&
            prev.bounds?.swLng === bounds?.swLng &&
            prev.bounds?.neLat === bounds?.neLat &&
            prev.bounds?.neLng === bounds?.neLng;
          return same ? prev : { bounds, width, height };
        });
      }

      if (!cb) return;
      cb({
        zoom,
        center: c ? { lat: c.lat(), lng: c.lng() } : { lat: 0, lng: 0 },
        bounds:
          sw && ne
            ? { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() }
            : null,
      });
    };

    maps.Event.addListener(map, "idle", emit);
  }, [loaded]);

  // 반경 원 오버레이(C3) — circle prop 있을 때만 생성/갱신, 없으면 제거. 기존 지도엔 영향 없음.
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps as
      | { Circle: new (opts: Record<string, unknown>) => NaverCircle; LatLng: new (a: number, b: number) => unknown }
      | undefined;
    if (!maps) return;
    if (!circle) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      return;
    }
    const centerLL = new maps.LatLng(circle.lat, circle.lng);
    if (circleRef.current) {
      circleRef.current.setCenter(centerLL);
      circleRef.current.setRadius(circle.radiusM);
    } else {
      circleRef.current = new maps.Circle({
        map: mapRef.current,
        center: centerLL,
        radius: circle.radiusM,
        fillColor: "#1d4fd8",
        fillOpacity: 0.08,
        strokeColor: "#1d4fd8",
        strokeOpacity: 0.6,
        strokeWeight: 2,
      });
    }
  }, [loaded, circle]);

  /*
   * 지도 클릭 → 좌표 전달.
   *
   * 리스너는 지도가 살아 있는 동안 한 번만 붙이고, 실제로 쓸지 말지는
   * onMapClickRef 가 판단한다. 모드가 바뀔 때마다 붙였다 떼면 그 사이 클릭이
   * 새는 데다, SDK 의 removeListener 유무가 버전마다 달라 신뢰하기 어렵다.
   */
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    if (!maps) return;
    maps.Event.addListener(mapRef.current, "click", (...args: unknown[]) => {
      if (Date.now() < suppressMapClickUntilRef.current) return;
      const cb = onMapClickRef.current;
      if (!cb) return;
      const ev = args[0] as { coord?: { lat: () => number; lng: () => number } } | undefined;
      const coord = ev?.coord;
      if (!coord) return;
      cb({ lat: coord.lat(), lng: coord.lng() });
    });
  }, [loaded]);

  /*
   * 거리 재기 오버레이 — 지점 사이를 잇는 선 + 각 지점의 번호/누적거리 뱃지.
   * 지점은 드래그 가능(편집). 드래그 직후 map click 은 suppress 한다.
   */
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    if (!maps) return;
    const map = mapRef.current;

    for (const m of measureMarkersRef.current) m.setMap(null);
    measureMarkersRef.current = [];

    const pts = measurePath ?? [];
    if (pts.length === 0) {
      measureLineRef.current?.setMap(null);
      measureLineRef.current = null;
      return;
    }

    const path = pts.map((p) => new maps.LatLng(p.lat, p.lng));
    if (pts.length >= 2 && typeof maps.Polyline === "function") {
      if (measureLineRef.current?.setPath) {
        measureLineRef.current.setPath(path);
        measureLineRef.current.setMap(map);
      } else {
        measureLineRef.current = new maps.Polyline({
          map,
          path,
          strokeColor: "#1d4fd8",
          strokeOpacity: 0.95,
          strokeWeight: 3.5,
          strokeStyle: "solid",
          zIndex: 350,
        });
      }
    } else {
      measureLineRef.current?.setMap(null);
    }

    pts.forEach((p, i) => {
      const marker = new maps.Marker({
        position: new maps.LatLng(p.lat, p.lng),
        map,
        title: p.label ?? `지점 ${i + 1}`,
        icon: {
          content: buildMeasurePointHtml(i + 1, p.label, p.selected),
          anchor: new maps.Point(0, 0),
        },
        zIndex: p.selected ? 460 : 400,
        draggable: true,
      });
      maps.Event.addListener(marker, "click", () => {
        onMeasurePointClickRef.current?.(i);
      });
      maps.Event.addListener(marker, "dragend", () => {
        suppressMapClickUntilRef.current = Date.now() + 400;
        const pos = marker.getPosition?.();
        if (!pos) return;
        onMeasurePointDragEndRef.current?.(i, { lat: pos.lat(), lng: pos.lng() });
      });
      measureMarkersRef.current.push(marker);
    });
  }, [loaded, measurePath]);

  /* 차량·도보 등 추가 경로 점선 */
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    if (!maps || typeof maps.Polyline !== "function") return;
    const map = mapRef.current;

    for (const line of routeLinesRef.current) line.setMap(null);
    routeLinesRef.current = [];

    const overlays = routeOverlays ?? [];
    for (const ov of overlays) {
      if (!ov.path || ov.path.length < 2) continue;
      const line = new maps.Polyline({
        map,
        path: ov.path.map((p) => new maps.LatLng(p.lat, p.lng)),
        strokeColor: ov.color,
        strokeOpacity: ov.strokeOpacity ?? 0.85,
        strokeWeight: ov.strokeWeight ?? 3,
        strokeStyle: ov.dashed ? "shortdash" : "solid",
        zIndex: 340,
      });
      routeLinesRef.current.push(line);
    }
  }, [loaded, routeOverlays]);

  /* 반경 중심·가장자리 드래그 핸들 */
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    if (!maps) return;
    const map = mapRef.current;

    const clearHandles = () => {
      radiusCenterMarkerRef.current?.setMap(null);
      radiusCenterMarkerRef.current = null;
      radiusEdgeMarkerRef.current?.setMap(null);
      radiusEdgeMarkerRef.current = null;
    };

    if (!circle) {
      clearHandles();
      return;
    }

    const centerLL = new maps.LatLng(circle.lat, circle.lng);
    /* 북쪽 가장자리 — 대략 111_320 m/도 */
    const edgeLat = circle.lat + circle.radiusM / 111_320;
    const edgeLL = new maps.LatLng(edgeLat, circle.lng);

    if (radiusCenterMarkerRef.current) {
      radiusCenterMarkerRef.current.setPosition?.(centerLL);
      radiusCenterMarkerRef.current.setMap?.(map);
    } else {
      const centerMarker = new maps.Marker({
        position: centerLL,
        map,
        title: "반경 중심 · 드래그해서 이동",
        icon: {
          content: buildRadiusHandleHtml("중심"),
          anchor: new maps.Point(0, 0),
        },
        zIndex: 420,
        draggable: true,
      });
      maps.Event.addListener(centerMarker, "dragend", () => {
        suppressMapClickUntilRef.current = Date.now() + 400;
        const pos = centerMarker.getPosition?.();
        if (!pos) return;
        onRadiusCenterDragEndRef.current?.({ lat: pos.lat(), lng: pos.lng() });
      });
      radiusCenterMarkerRef.current = centerMarker;
    }

    if (radiusEdgeMarkerRef.current) {
      radiusEdgeMarkerRef.current.setPosition?.(edgeLL);
      radiusEdgeMarkerRef.current.setMap?.(map);
    } else {
      const edgeMarker = new maps.Marker({
        position: edgeLL,
        map,
        title: "반경 조절 · 드래그해서 크기 변경",
        icon: {
          content: buildRadiusHandleHtml("크기"),
          anchor: new maps.Point(0, 0),
        },
        zIndex: 421,
        draggable: true,
      });
      maps.Event.addListener(edgeMarker, "dragend", () => {
        suppressMapClickUntilRef.current = Date.now() + 400;
        const pos = edgeMarker.getPosition?.();
        const c = circlePropRef.current;
        if (!pos || !c) return;
        const dLat = pos.lat() - c.lat;
        const dLng = pos.lng() - c.lng;
        const meters = Math.sqrt(
          (dLat * 111_320) ** 2 +
            (dLng * 111_320 * Math.cos((c.lat * Math.PI) / 180)) ** 2,
        );
        const next = Math.min(5000, Math.max(100, Math.round(meters / 50) * 50));
        onRadiusEdgeDragEndRef.current?.(next);
      });
      radiusEdgeMarkerRef.current = edgeMarker;
    }
  }, [loaded, circle]);

  /**
   * 겹침 정리 결과. bounds·컨테이너 크기·마커 목록이 모두 갖춰졌을 때만 계산하고,
   * 하나라도 모르면 null(=아무것도 접지 않음)이다. 모를 때 접는 쪽이 아니라
   * 두는 쪽으로 기울인 것은, 잘못 접으면 실제로 있는 단지가 점 하나로 보이기
   * 때문이다.
   *
   * 우선순위: 선택 > 관심 > 세대수 큰 단지 > id. 세대수를 쓴 이유는 큰 단지가
   * 그 동네의 기준점 역할을 해서다. 값(가격)으로 줄 세우지 않는다 — 비싼 곳만
   * 라벨이 남으면 지도가 시세를 실제보다 높게 보이게 만든다.
   */
  const declutterState = useMemo(() => {
    if (!declutter || !mapView.bounds) return null;
    const items: DeclutterItem[] = [];
    for (const d of markers) {
      const isCluster = d.id.startsWith("cluster:");
      const isPrice = d.avgPricePerM2 !== undefined && !isCluster;
      if (isCluster) {
        /* 클러스터는 접지 않는다(묶인 N개가 통째로 감춰진다). 대신 자리는
           차지하므로 최우선으로 먼저 놓아 다른 라벨이 피해 가게 한다. */
        const w = d.priceLabel ? 96 : 46;
        items.push({ id: d.id, lat: d.lat, lng: d.lng, width: w, height: 40, priority: 1e12, anchor: "center" });
        continue;
      }
      const box = isPrice ? priceMarkerBox(d) : namePillBox(d.label);
      items.push({
        id: d.id,
        lat: d.lat,
        lng: d.lng,
        width: box.width,
        height: box.height,
        anchor: isPrice ? "bottom-center" : "center",
        priority:
          (d.selected ? 1e9 : 0) + (d.favorite ? 1e8 : 0) + Math.min(1e7, d.households ?? 0),
      });
    }
    const res = declutterMarkers(
      items,
      mapView.bounds,
      { width: mapView.width, height: mapView.height },
      { padding: 3, maxLabels: declutterMaxLabels },
    );
    for (const id of res.collapsed) if (id.startsWith("cluster:")) res.collapsed.delete(id);
    return res;
  }, [declutter, declutterMaxLabels, markers, mapView]);

  // 마커 증분 업데이트: id로 diff 하여 추가/갱신/제거만 반영(destroy-all 제거).
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    if (!maps) return;

    const map = mapRef.current;
    const store = markerMapRef.current;
    const nextIds = new Set<string>();

    const collapsedIds = declutterState?.collapsed;
    const zById = declutterState?.zIndexById;

    /**
     * 겹침 정리 뒤 쌓임 순서. 예전에는 선택/관심이 아닌 마커가 전부 zIndex 1
     * 이라, 어느 말풍선이 위로 오는지를 DOM 순서(=쿼리 정렬)가 정했다. 화면과
     * 상관없는 값이 화면을 정하고 있었던 셈이다. 이제는 겹침 정리와 같은
     * 우선순위를 그대로 쓴다.
     */
    const zIndexOf = (data: MapMarkerData) => {
      if (data.selected) return 200;
      if (collapsedIds?.has(data.id)) return 0;
      const base = data.favorite ? 120 : 1;
      const rank = zById?.get(data.id);
      return rank === undefined ? base : base + Math.min(60, Math.round(rank / 10));
    };

    const buildIcon = (data: MapMarkerData) => {
      const color = data.pinColor ?? "#3182f6";
      const isCluster = data.id.startsWith("cluster:");
      const isPriceMarker = data.avgPricePerM2 !== undefined && !isCluster;
      if (collapsedIds?.has(data.id) && !isCluster) {
        return { content: buildCollapsedDotHtml(data), anchor: new maps.Point(0, 0) };
      }
      if (isCluster) {
        // priceLabel이 있으면 "N개 · 12.3억" 알약형(호갱노노식), 없으면 기존 개수 원형
        return {
          content: buildClusterMarkerHtml(
            data.label,
            color,
            data.priceLabel,
            data.pinTextColor,
          ),
          anchor: data.priceLabel ? new maps.Point(0, 0) : new maps.Point(22, 22),
        };
      }
      if (isPriceMarker) {
        return { content: buildPriceMarkerHtml(data), anchor: new maps.Point(0, 0) };
      }
      // 이름 알약은 가운데 정렬(transform)로 위치를 맞추므로 앵커는 0,0.
      return { content: buildMarkerHtml(data.label, color), anchor: new maps.Point(0, 0) };
    };

    for (const data of markers) {
      nextIds.add(data.id);
      const signature = markerSignature(data, collapsedIds?.has(data.id) ?? false);
      const existing = store.get(data.id);

      if (existing) {
        existing.data = data;
        if (existing.signature !== signature) {
          existing.marker.setPosition?.(new maps.LatLng(data.lat, data.lng));
          existing.marker.setIcon?.(buildIcon(data));
          existing.marker.setZIndex?.(zIndexOf(data));
          existing.signature = signature;
        }
        continue;
      }

      const marker = new maps.Marker({
        position: new maps.LatLng(data.lat, data.lng),
        map,
        title: data.label,
        icon: buildIcon(data),
        zIndex: zIndexOf(data),
      });
      const entry: MarkerEntry = { marker, data, signature };
      store.set(data.id, entry);

      /* 누르기 전에 요약을 보여 준다 — 클러스터는 단지가 아니므로 제외. */
      if (!data.id.startsWith("cluster:")) {
        maps.Event.addListener(marker, "mouseover", () => {
          onMarkerHoverRef.current?.(store.get(data.id)?.data ?? data);
        });
        maps.Event.addListener(marker, "mouseout", () => {
          onMarkerHoverRef.current?.(null);
        });
      }

      maps.Event.addListener(marker, "click", () => {
        if (infoWindowRef.current) infoWindowRef.current.close();
        const current = store.get(data.id)?.data ?? data;
        // infoHtml === "" 이면 인포윈도우 없이 클릭 콜백만 (커스텀 패널 UI용)
        if (current.infoHtml !== "") {
          const iw = new maps.InfoWindow({
            content: current.infoHtml ?? buildInfoHtml(current),
          });
          iw.open(map, marker);
          infoWindowRef.current = iw;
        }
        onMarkerClickRef.current?.(current);
      });
    }

    // 사라진 마커 제거
    for (const [id, entry] of store) {
      if (!nextIds.has(id)) {
        entry.marker.setMap(null);
        store.delete(id);
      }
    }

    // fitBounds 는 마커 "집합"이 바뀐 경우에만 (정렬·아이콘 변경 시 생략)
    const idKey = Array.from(nextIds).sort().join("|");
    const idSetChanged = idKey !== prevIdKeyRef.current;
    prevIdKeyRef.current = idKey;

    if (fitToMarkers && idSetChanged && markers.length > 1) {
      let minLat = markers[0].lat;
      let maxLat = markers[0].lat;
      let minLng = markers[0].lng;
      let maxLng = markers[0].lng;
      for (const m of markers) {
        minLat = Math.min(minLat, m.lat);
        maxLat = Math.max(maxLat, m.lat);
        minLng = Math.min(minLng, m.lng);
        maxLng = Math.max(maxLng, m.lng);
      }
      const bounds = new maps.LatLngBounds(
        new maps.LatLng(minLat, minLng),
        new maps.LatLng(maxLat, maxLng),
      );
      map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
    }
  }, [loaded, markers, fitToMarkers, declutterState]);

  const goToMyLocation = useCallback(() => {
    if (!navigator.geolocation || !mapRef.current) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const maps = getNaverMapsWindow().naver?.maps;
        if (maps && mapRef.current) {
          mapRef.current.setCenter(
            new maps.LatLng(pos.coords.latitude, pos.coords.longitude),
          );
          mapRef.current.setZoom(Math.max(mapLevelToNaverZoom(level), 14));
        }
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }, [level]);

  if (error) {
    if (fallback !== undefined) return <>{fallback}</>;
    // 네이버 지도 인증/로드 실패 시 무료 OSM 타일로 폴백 (키 불필요)
    const d = 0.06;
    const bbox = `${center.lng - d},${center.lat - d},${center.lng + d},${center.lat + d}`;
    const osmSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
      bbox,
    )}&layer=mapnik&marker=${center.lat},${center.lng}`;
    return (
      <div className={`relative min-h-[200px] overflow-hidden rounded-2xl bg-slate-100 ${className}`}>
        <iframe
          title="대체 지도 (OpenStreetMap)"
          src={osmSrc}
          className="h-full w-full min-h-[200px] border-0"
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 z-10 bg-amber-50/95 px-3 py-2 text-[12px] leading-snug text-amber-900 backdrop-blur">
          <span className="font-bold">대체 지도(OSM)</span> — 네이버 지도를 불러오지 못했어요.{" "}
          {error}
        </div>
      </div>
    );
  }

  if (!NAVER_MAP_CLIENT_ID) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl bg-slate-50 border border-dashed border-slate-300 ${className}`}
      >
        <p className="text-2xl">
          <Icon name="🗺" size={24} />
        </p>
        <p className="text-[13px] font-semibold text-slate-700">지도 미리보기</p>
        <p className="text-xs text-slate-500 text-center px-4">
          네이버 지도 API Client ID가 필요합니다.
          <br />
          <code className="bg-slate-100 px-1 rounded">NEXT_PUBLIC_NAVER_MAP_CLIENT_ID</code>를
          .env.local에 추가하세요.
        </p>
      </div>
    );
  }

  return (
    /* 지도 컨테이너 높이 — 원인 확정(2026-08-28, 헤드리스 크롬 실측).

       2026-08-26 CLS 작업에서 안쪽 컨테이너를 `h-full w-full min-h-[200px]`
       → `absolute inset-0` 으로 바꿨다. 그 뒤 지도가 "아주 살짝 보이다가
       사라졌다". 원인은 레이아웃이 아니라 **SDK 가 우리 클래스를 덮어쓰는 것**:

         new naver.maps.Map(el, …) 이 el 에 인라인으로
         `position: relative; overflow: hidden; background: #f8f9fa` 를 쓴다.

       인라인 스타일이 Tailwind `absolute` 를 이긴다. position 이 relative 가
       되는 순간 `inset-0` 은 늘리는 힘을 잃고 offset 으로만 남는다. 높이는
       auto 로 풀리는데 SDK 가 넣는 자식은 전부 position:absolute 라 기여분이
       0 이다 → 컨테이너가 height:0 으로 접힌다.

       프로덕션 번들 실측(1280×860):
         `absolute inset-0`            → /map 1280×0   · 마커 0개
         `h-full w-full min-h-[200px]` → /map 1280×860 · 마커 렌더 확인
       홈 미니맵 842×0 → 842×358, /redevelopment 1066×0 → 1066×560.

       그래서 높이는 position 에 의존하지 않는 방식으로만 준다(h-full = 100%).
       min-h-[200px] 는 부모 높이가 확정되지 않은 자리에서 100% 가 auto 로
       풀릴 때의 바닥이다 — 이걸 빼면 그런 자리에서 다시 0 이 된다.
       바깥 상자의 min-h 는 CLS 방어로 그대로 둔다. */
    <div
      className={cn(
        "relative h-full w-full min-h-[200px] overflow-hidden",
        rounded && "rounded-2xl",
        className,
      )}
    >
      {enableGeolocation ? (
        <button
          type="button"
          onClick={goToMyLocation}
          disabled={!loaded || geoLoading}
          /* 모바일22 — 36→44px(터치 하한). bottom-right 는 한 손 조작 반경
             (우하단)이며 모바일 탭바(바닥 6px + 높이 ~59px) 위로 띄운다. */
          className={`absolute z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[15px] shadow-md ring-1 ring-black/10 hover:bg-slate-50 disabled:opacity-60 ${
            geolocationButtonPosition === "bottom-left"
              ? "bottom-3 left-3"
              : geolocationButtonPosition === "bottom-right"
                ? /* right-[15px]: 이 버튼(44px)의 중심을 그 위에 쌓이는 34px 줌
                     컨트롤(right-5) 중심과 맞춘다 — 20+17 = 15+22 = 37.
                     md 에서도 같은 자리를 쓴다. 예전의 md:bottom-6 은 우하단
                     범례(bottom-5) 위로 올라타 있었다. */
                  "right-[15px] bottom-[calc(env(safe-area-inset-bottom,0px)+78px)]"
                : "right-2 top-2"
          }`}
          title="내 위치"
          aria-label="내 위치로 이동"
        >
          {geoLoading ? "…" : <Icon name="📍" size={20} />}
        </button>
      ) : null}
      {!loaded ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-br from-line to-line-strong">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : null}
      {/* 지점을 찍는 모드에서는 커서로 "지금 클릭하면 찍힌다"를 알린다.
          [&_*]로 내부 타일까지 내려야 실제로 바뀐다 — SDK 가 그린 자식 요소가
          자기 커서를 따로 갖고 있어서 컨테이너에만 주면 되돌아간다. */}
      <div
        ref={containerRef}
        className={cn(
          "h-full w-full min-h-[200px]",
          crosshair && "cursor-crosshair [&_*]:cursor-crosshair",
        )}
      />
    </div>
  );
}

/** HTML 문자열로 조립하므로 라벨은 반드시 이스케이프한다(단지명에 & < > 가 들어온다). */
function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 시세를 모르는 단지 마커.
 *
 * ── 2026-07-28: 첫 글자 한 자만 보여 주고 있었다 ──────────────────────────
 * 예전에는 28px 원 안에 `label.charAt(0)` 만 찍었다. 그래서 지도를 확대하면
 * "덕", "수", "강", "삼", "포" 같은 파란 동그라미가 시세 말풍선 사이에 흩어졌다.
 * 그 한 글자로는 어느 단지인지 알 수 없고, 눌러 보기 전에는 알 방법도 없다 —
 * 화면에 자리는 차지하면서 아무것도 알려 주지 않는 표시였다.
 *
 * 이름은 우리가 아는 값이다. 모르는 건 시세뿐이다. 그러니 아는 것(이름)을
 * 보여 주고, 모르는 것(시세)은 색과 문구로 구분한다. 시세 말풍선과 헷갈리지
 * 않도록 회색 계열 · 작은 글씨로 낮춰 그린다.
 *
 * 이름이 길면 잘라서 말줄임한다 — 마커가 길어지면 지도가 이름으로 덮인다.
 */
/** 거리 재기 지점 — 번호 원 + (있으면) 누적거리 라벨. selected 면 링 강조. */
function buildMeasurePointHtml(index: number, label?: string, selected?: boolean): string {
  const ring = selected ? "0 0 0 3px rgba(29,79,216,.35)" : "0 2px 6px rgba(16,28,54,.3)";
  const bg = selected ? "#0b3db8" : "#1d4fd8";
  const dot = `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:${bg};color:#fff;font:700 11px sans-serif;border:2px solid #fff;box-shadow:${ring};flex:none;cursor:grab">${index}</span>`;
  const text = label
    ? `<span style="border-radius:9999px;background:rgba(29,79,216,.95);color:#fff;font:700 11px sans-serif;padding:3px 8px;white-space:nowrap;box-shadow:0 2px 6px rgba(16,28,54,.25)">${escapeHtml(label)}</span>`
    : "";
  return `<div style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:5px">${dot}${text}</div>`;
}

function buildRadiusHandleHtml(label: string): string {
  return `<div style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:4px;cursor:grab"><span style="width:14px;height:14px;border-radius:9999px;background:#fff;border:2.5px solid #1d4fd8;box-shadow:0 2px 8px rgba(16,28,54,.28)"></span><span style="border-radius:9999px;background:rgba(16,28,54,.82);color:#fff;font:700 10px sans-serif;padding:2px 7px;white-space:nowrap">${escapeHtml(label)}</span></div>`;
}

const NO_PRICE_LABEL_MAX = 9;

function buildMarkerHtml(label: string, color: string): string {
  const name = label.trim();
  if (!name) {
    // 이름조차 없으면 예전처럼 작은 점 하나. 지어낼 이름이 없다.
    return `<div style="width:10px;height:10px;border-radius:9999px;background:${color};box-shadow:0 1px 4px rgba(0,0,0,.25);border:2px solid #fff"></div>`;
  }
  const shown =
    name.length > NO_PRICE_LABEL_MAX ? `${name.slice(0, NO_PRICE_LABEL_MAX)}…` : name;
  return `<div style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:4px;white-space:nowrap;border-radius:9999px;background:rgba(255,255,255,.95);color:#3f4b5b;font:600 11px sans-serif;padding:4px 9px;box-shadow:0 1px 5px rgba(16,28,54,.18);border:1px solid rgba(16,28,54,.12)"><span style="width:5px;height:5px;border-radius:9999px;background:${color};flex:none"></span>${escapeHtml(shown)}</div>`;
}

/**
 * 클러스터 마커.
 * - priceLabel 없음: 묶인 개수만 원형 배지로 표시 (기존 동작)
 * - priceLabel 있음: "N개 · 4,020만/평" 알약형 라벨 (C1 시세 색상 오버레이)
 *
 * textColor 는 배경 명도에 맞춰 호출부가 골라 준다. 배경이 옅은 노랑일 때 흰 글자를
 * 그대로 쓰면 읽히지 않아서, 색상 단계와 글자색을 한 쌍으로 다룬다.
 */
function buildClusterMarkerHtml(
  label: string,
  color: string,
  priceLabel?: string,
  textColor?: string,
): string {
  const count = label.trim() || "0";
  if (priceLabel) {
    const fg = textColor ?? "#fff";
    return `<div style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:4px;white-space:nowrap;border-radius:9999px;background:${color};color:${fg};font:bold 12px sans-serif;padding:6px 12px;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff"><span style="opacity:.85">${count}개</span><span style="opacity:.55">·</span><span style="font-size:13px">${priceLabel}</span></div>`;
  }
  const size = count.length >= 4 ? 52 : count.length >= 3 ? 46 : 40;
  return `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${color};color:#fff;font:bold 13px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);border:3px solid #fff">${count}</div>`;
}

/** 평균가(원)를 억/만 단위 라벨로 (예: 28.5억, 8,200만) */
function formatEokLabel(won: number): string {
  if (!Number.isFinite(won) || won <= 0) return "—";
  if (won >= 100_000_000) {
    const eok = won / 100_000_000;
    return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
  }
  return `${Math.round(won / 10_000).toLocaleString("ko-KR")}만`;
}

/**
 * 호갱노노 스타일 시세 말풍선 마커.
 * 좌표 위에 평균가 + 전월대비 등락률(부동산 관례: 상승=빨강, 하락=파랑)을 표시한다.
 */
function buildPriceMarkerHtml(data: MapMarkerData): string {
  const won = data.avgPriceWon ?? (data.avgPricePerM2 ?? 0) * 84;
  const price = data.priceLabel ?? formatEokLabel(won);
  const pct = data.momPct;
  const hasPct = pct !== undefined && Number.isFinite(pct);
  const up = (pct ?? 0) >= 0;
  const pctColor = up ? "#e11900" : "#1565d8";
  const arrow = up ? "▲" : "▼";
  const pctHtml = hasPct
    ? `<span style="font-size:11px;font-weight:700;color:${pctColor}">${arrow}${Math.abs(pct as number).toFixed(2)}%</span>`
    : "";
  const tier = data.tierColor;
  const selected = data.selected;
  const borderColor = selected ? "#3182f6" : (tier ?? "#d1d6db");
  const borderWidth = selected ? 2 : tier ? 1.5 : 1;
  const priceColor = tier ?? "#191f28";
  const bg = selected ? "#eef5ff" : "#fff";
  const star = data.favorite
    ? `<span style="font-size:11px;color:#f59e0b;margin-left:1px">★</span>`
    : "";
  const tip = selected ? "#3182f6" : "#fff";
  /*
   * 단지 줌에서는 이름을 값과 함께 적는다.
   *
   * 예전에는 "전세 2.5억" 같은 값만 떠 있었다. 지도를 확대해 봐도 어느 단지의
   * 2.5억인지는 눌러 봐야 알 수 있었다 — 여러 단지를 견주려면 하나씩 눌렀다
   * 닫기를 반복해야 했다는 뜻이다. 값 옆에 이름이 있으면 그 비교가 지도 위에서
   * 끝난다. 대신 넓은 줌에서는 이름이 서로 겹치므로 showName 이 켜졌을 때만 적고,
   * 길면 잘라 낸다.
   */
  const rawName = data.label?.trim() ?? "";
  const nameHtml =
    data.showName && rawName
      ? `<span style="font-size:11px;font-weight:700;color:#5b6675;max-width:96px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(
          rawName.length > 8 ? `${rawName.slice(0, 8)}…` : rawName,
        )}</span><span style="width:1px;height:10px;background:rgba(16,28,54,.16)"></span>`
      : "";
  return `
  <div style="display:inline-block;transform:translate(-50%,-100%);white-space:nowrap;font-family:sans-serif">
    <div style="display:inline-flex;align-items:center;gap:4px;background:${bg};border:${borderWidth}px solid ${borderColor};border-radius:9999px;padding:3px 9px;box-shadow:0 2px 6px rgba(0,0,0,.18)">
      ${nameHtml}<span style="font-size:12px;font-weight:800;color:${priceColor}">${price}</span>
      ${pctHtml}${star}
    </div>
    <div style="width:0;height:0;margin:-1px auto 0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${tip}"></div>
  </div>`;
}

/**
 * 겹침 정리로 라벨이 접힌 시세 마커. 지우지 않고 점으로 남긴다 —
 * 마커가 사라지면 이용자는 "여기엔 단지가 없다" 로 읽고, 그건 겹침보다 나쁜
 * 거짓말이다. 눌러야 알 수 있게 만든 대신 **누를 수는 있어야** 하므로
 * 바깥에 투명 여백을 둬 손가락 표적을 24px 로 잡는다(점 자체는 12px).
 */
function buildCollapsedDotHtml(data: MapMarkerData): string {
  const ring = data.selected ? "#3182f6" : (data.tierColor ?? "#8b95a1");
  const fill = data.favorite ? "#f59e0b" : "#fff";
  return `<div style="transform:translate(-50%,-50%);padding:6px;cursor:pointer"><div style="width:12px;height:12px;border-radius:9999px;background:${fill};border:2.5px solid ${ring};box-shadow:0 1px 4px rgba(16,28,54,.28)"></div></div>`;
}

/* ── 말풍선 상자 크기 ─────────────────────────────────────────────────────
   아래 숫자들은 위 build*Html 의 style 문자열에서 그대로 따온 것이다(패딩·
   테두리·gap·글자 크기). HTML 을 고치면 여기도 같이 고쳐야 한다. 둘이 어긋나면
   겹침 판정이 조용히 틀어지므로, 값을 바꿀 땐 항상 짝으로 본다. */

/** buildPriceMarkerHtml 의 바깥 상자 크기(꼬리 포함). */
function priceMarkerBox(data: MapMarkerData): { width: number; height: number } {
  const bw = data.selected ? 2 : data.tierColor ? 1.5 : 1;
  const price = data.priceLabel ?? formatEokLabel(data.avgPriceWon ?? (data.avgPricePerM2 ?? 0) * 84);
  const parts: number[] = [textWidth(price, "800 12px sans-serif", 7.5)];
  const rawName = data.label?.trim() ?? "";
  if (data.showName && rawName) {
    const shown = rawName.length > 8 ? `${rawName.slice(0, 8)}…` : rawName;
    parts.unshift(1); // 1px 세로 구분선
    parts.unshift(Math.min(96, textWidth(shown, "700 11px sans-serif", 7)));
  }
  if (data.momPct !== undefined && Number.isFinite(data.momPct)) {
    parts.push(
      textWidth(`▲${Math.abs(data.momPct).toFixed(2)}%`, "700 11px sans-serif", 6.5),
    );
  }
  if (data.favorite) parts.push(textWidth("★", "700 11px sans-serif", 7) + 1);

  const content = parts.reduce((a, b) => a + b, 0) + 4 * Math.max(0, parts.length - 1);
  return {
    width: content + 18 /* padding 9+9 */ + bw * 2,
    height: 15 /* 12px 글자 줄상자 */ + 6 /* padding 3+3 */ + bw * 2 + 5 /* 꼬리 6 - margin 1 */,
  };
}

/** buildMarkerHtml(이름 알약) 의 상자 크기. */
function namePillBox(label: string): { width: number; height: number } {
  const name = label.trim();
  if (!name) return { width: 10, height: 10 };
  const shown =
    name.length > NO_PRICE_LABEL_MAX ? `${name.slice(0, NO_PRICE_LABEL_MAX)}…` : name;
  return {
    width: textWidth(shown, "600 11px sans-serif", 7) + 5 /* 점 */ + 4 /* gap */ + 18 + 2,
    height: 14 + 8 + 2,
  };
}

function buildInfoHtml(data: MapMarkerData): string {
  const won = data.avgPriceWon ?? (data.avgPricePerM2 ?? 0) * 84;
  const price =
    data.priceLabel ??
    (won > 0
      ? formatEokLabel(won)
      : data.avgPricePerM2
        ? `${(data.avgPricePerM2 / 10_000).toFixed(0)}만원/m²`
        : "시세 미제공");
  const trend =
    data.momPct !== undefined
      ? `<span style="color:${data.momPct >= 0 ? "#e11900" : "#1565d8"}">${data.momPct >= 0 ? "▲" : "▼"} ${Math.abs(data.momPct)}%</span>`
      : "";
  return `
    <div style="padding:10px 14px;min-width:160px;font-family:sans-serif">
      <p style="font-weight:700;font-size:13px;margin:0 0 4px">${data.label}</p>
      <p style="font-size:12px;color:#555;margin:0">${price} ${trend}</p>
      ${data.tradeCount30d !== undefined ? `<p style="font-size:11px;color:#888;margin:4px 0 0">30일 거래 ${data.tradeCount30d}건</p>` : ""}
      <div style="margin-top:8px;display:flex;gap:6px">
        <a href="/community?q=${encodeURIComponent(data.label)}" style="font-size:11px;color:#3182f6">커뮤니티</a>
        <a href="/experts?q=${encodeURIComponent(data.label)}" style="font-size:11px;color:#3182f6">전문가</a>
      </div>
    </div>
  `;
}
