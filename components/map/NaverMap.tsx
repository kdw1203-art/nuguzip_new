"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /** 시세 말풍선 강조색 (마커 색상 단계 = 가격대 히트) */
  tierColor?: string;
  /** 관심 단지(★) */
  favorite?: boolean;
  /** 선택 상태(목록에서 클릭 등) */
  selected?: boolean;
}

type MarkerEntry = {
  marker: NaverMarker;
  data: MapMarkerData;
  signature: string;
};

/** 마커 외형/위치에 영향을 주는 필드만 직렬화해 증분 갱신 판단에 쓴다. */
function markerSignature(d: MapMarkerData): string {
  return [
    d.lat,
    d.lng,
    d.label,
    d.pinColor ?? "",
    d.tierColor ?? "",
    d.avgPriceWon ?? "",
    d.priceLabel ?? "",
    d.avgPricePerM2 ?? "",
    d.momPct ?? "",
    d.favorite ? 1 : 0,
    d.selected ? 1 : 0,
  ].join(":");
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
  geolocationButtonPosition?: "top-right" | "bottom-left";
  /** 지도 유형 — 일반/위성 */
  mapType?: "normal" | "satellite";
  /** 지도 이동/줌이 멈추면 현재 영역·줌을 알린다 */
  onIdle?: (info: MapIdleInfo) => void;
  /** false면 모서리 라운드 없음 (풀스크린 /explore) */
  rounded?: boolean;
  /** SDK 로드 실패·Client ID 미설정 시 대신 렌더할 노드 (미지정 시 OSM 폴백) */
  fallback?: React.ReactNode;
}

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
}: NaverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
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
  const bicycleLayerRef = useRef<NaverLayer | null>(null);

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
              ? " ⚠ 지금 *.vercel.app 미리보기 URL로 보고 있습니다 — https://nuguzip.com 으로 접속하거나 이 미리보기 도메인도 등록해야 합니다."
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
      if (!cb) return;
      const zoom = map.getZoom?.() ?? 0;
      const c = map.getCenter?.();
      const b = map.getBounds?.();
      const sw = b?.getSW?.();
      const ne = b?.getNE?.();
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

  // 마커 증분 업데이트: id로 diff 하여 추가/갱신/제거만 반영(destroy-all 제거).
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const maps = getNaverMapsWindow().naver?.maps;
    if (!maps) return;

    const map = mapRef.current;
    const store = markerMapRef.current;
    const nextIds = new Set<string>();

    const buildIcon = (data: MapMarkerData) => {
      const color = data.pinColor ?? "#3182f6";
      const isCluster = data.id.startsWith("cluster:");
      const isPriceMarker = data.avgPricePerM2 !== undefined && !isCluster;
      if (isCluster) {
        // priceLabel이 있으면 "N개 · 12.3억" 알약형(호갱노노식), 없으면 기존 개수 원형
        return {
          content: buildClusterMarkerHtml(data.label, color, data.priceLabel),
          anchor: data.priceLabel ? new maps.Point(0, 0) : new maps.Point(22, 22),
        };
      }
      if (isPriceMarker) {
        return { content: buildPriceMarkerHtml(data), anchor: new maps.Point(0, 0) };
      }
      return { content: buildMarkerHtml(data.label, color), anchor: new maps.Point(14, 14) };
    };

    for (const data of markers) {
      nextIds.add(data.id);
      const signature = markerSignature(data);
      const existing = store.get(data.id);

      if (existing) {
        existing.data = data;
        if (existing.signature !== signature) {
          existing.marker.setPosition?.(new maps.LatLng(data.lat, data.lng));
          existing.marker.setIcon?.(buildIcon(data));
          existing.marker.setZIndex?.(data.selected ? 200 : data.favorite ? 120 : 1);
          existing.signature = signature;
        }
        continue;
      }

      const marker = new maps.Marker({
        position: new maps.LatLng(data.lat, data.lng),
        map,
        title: data.label,
        icon: buildIcon(data),
        zIndex: data.selected ? 200 : data.favorite ? 120 : 1,
      });
      const entry: MarkerEntry = { marker, data, signature };
      store.set(data.id, entry);

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
  }, [loaded, markers, fitToMarkers]);

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
      <div className={`relative overflow-hidden rounded-2xl bg-slate-100 ${className}`}>
        <iframe
          title="대체 지도 (OpenStreetMap)"
          src={osmSrc}
          className="h-full w-full min-h-[200px] border-0"
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 z-10 bg-amber-50/95 px-3 py-2 text-[11px] leading-snug text-amber-900 backdrop-blur">
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
        <p className="text-2xl">🗺️</p>
        <p className="text-sm font-semibold text-slate-700">지도 미리보기</p>
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
    <div
      className={cn(
        "relative h-full w-full min-h-0 overflow-hidden",
        rounded && "rounded-2xl",
        className,
      )}
    >
      {enableGeolocation ? (
        <button
          type="button"
          onClick={goToMyLocation}
          disabled={!loaded || geoLoading}
          className={`absolute z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-md ring-1 ring-black/10 hover:bg-slate-50 disabled:opacity-60 ${
            geolocationButtonPosition === "bottom-left"
              ? "bottom-3 left-3"
              : "right-2 top-2"
          }`}
          title="내 위치"
          aria-label="내 위치로 이동"
        >
          {geoLoading ? "…" : "📍"}
        </button>
      ) : null}
      {!loaded ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1d4fd8] border-t-transparent" />
        </div>
      ) : null}
      <div ref={containerRef} className="h-full w-full min-h-[200px]" />
    </div>
  );
}

function buildMarkerHtml(label: string, color: string): string {
  const initial = label.trim().charAt(0) || "·";
  return `<div style="width:28px;height:28px;border-radius:9999px;background:${color};color:#fff;font:bold 12px/28px sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.25);border:2px solid #fff">${initial}</div>`;
}

/**
 * 클러스터 마커.
 * - priceLabel 없음: 묶인 개수만 원형 배지로 표시 (기존 동작)
 * - priceLabel 있음: "N개 · 12.3억" 알약형 라벨 (호갱노노식 지도 가격 라벨)
 */
function buildClusterMarkerHtml(label: string, color: string, priceLabel?: string): string {
  const count = label.trim() || "0";
  if (priceLabel) {
    return `<div style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:4px;white-space:nowrap;border-radius:9999px;background:${color};color:#fff;font:bold 12px sans-serif;padding:6px 12px;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff"><span style="opacity:.85">${count}개</span><span style="opacity:.55">·</span><span style="font-size:13px">${priceLabel}</span></div>`;
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
  return `
  <div style="display:inline-block;transform:translate(-50%,-100%);white-space:nowrap;font-family:sans-serif">
    <div style="display:inline-flex;align-items:center;gap:4px;background:${bg};border:${borderWidth}px solid ${borderColor};border-radius:9999px;padding:3px 9px;box-shadow:0 2px 6px rgba(0,0,0,.18)">
      <span style="font-size:12px;font-weight:800;color:${priceColor}">${price}</span>
      ${pctHtml}${star}
    </div>
    <div style="width:0;height:0;margin:-1px auto 0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${tip}"></div>
  </div>`;
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
