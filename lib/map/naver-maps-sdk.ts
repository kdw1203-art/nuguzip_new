/** 레거시 level(1=확대, 14=축소) → 네이버 zoom(1~21) 근사 변환 */
export function mapLevelToNaverZoom(level: number): number {
  return Math.min(21, Math.max(1, 21 - level));
}

/** @deprecated mapLevelToNaverZoom 사용 */
export const kakaoLevelToNaverZoom = mapLevelToNaverZoom;

const NAVER_MAPS_CALLBACK = "__woodongNaverMapsReady";
const NAVER_MAPS_READY_TIMEOUT_MS = 15_000;

/** NCP 통합 콘솔 Client ID (= maps.js 의 ncpKeyId 값) */
export function resolveNaverMapClientId(): string {
  return (
    process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_NAVER_NCP_KEY_ID?.trim() ||
    ""
  );
}

export const NAVER_MAP_CLIENT_ID = resolveNaverMapClientId();

/**
 * Style Editor에서 발행한 My Style ID (GL 벡터맵 전용).
 * 공개 클라이언트 값이라 기본값으로 둔다(환경변수가 있으면 우선).
 */
export const NAVER_MAP_STYLE_ID =
  process.env.NEXT_PUBLIC_NAVER_MAP_STYLE_ID?.trim() ||
  "54859818-a5f9-423c-8345-8b7f8c59e00d";

/** Style Editor 발행 Version — 특정 버전 스타일 고정 (환경변수가 있으면 우선). */
export const NAVER_MAP_STYLE_VERSION =
  process.env.NEXT_PUBLIC_NAVER_MAP_STYLE_VERSION?.trim() || "20260525005704";

/**
 * GL 커스텀 스타일 적용 여부 — **기본 비활성(opt-in)**.
 *
 * GL 벡터 스타일은 (1) 발행한 My Style이 현재 ncpKeyId와 동일한 NCP 계정 소유여야 하고
 * (2) 벡터 타일이 fetch/XHR 로 로드돼 CSP connect-src 허용이 필요하다. 이 둘 중
 * 하나라도 어긋나면 마커만 뜨고 바탕 타일이 비는(흰/회색) 지도가 된다.
 * 안정적인 표준(래스터) 지도를 기본으로 쓰고, 스타일이 확실할 때만
 * `NEXT_PUBLIC_NAVER_MAP_USE_CUSTOM_STYLE=1` 로 켠다.
 */
export const NAVER_MAP_USE_CUSTOM_STYLE =
  process.env.NEXT_PUBLIC_NAVER_MAP_USE_CUSTOM_STYLE === "1";

export const NAVER_MAPS_SCRIPT_ID = "naver-maps-sdk-v3";

let naverMapsLoadPromise: Promise<void> | null = null;
let authFailed = false;

/** NCP Web Service URL / Dynamic Map 미설정 시 SDK가 호출하는 콜백 안내 문구 */
export const NAVER_MAP_AUTH_FAILURE_MESSAGE =
  "네이버 지도 인증 실패 — NCP Maps 콘솔 Application에서 'Dynamic Map'을 켜고, 'Web 서비스 URL'에 https://nuguzip.com, https://www.nuguzip.com, https://m.nuguzip.com, http://localhost, http://127.0.0.1 을 등록하세요(포트·경로 없이). localhost와 127.0.0.1은 별도 주소입니다.";

export const NAVER_MAP_SETUP_DOC_PATH = "/docs/naver-map-ncp-setup.md";

export const NAVER_MAP_DOCS_URL =
  "https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html";

export function usesNaverCustomStyle(): boolean {
  return Boolean(NAVER_MAP_USE_CUSTOM_STYLE && NAVER_MAP_STYLE_ID);
}

/**
 * NCP 통합 콘솔(2024~) — maps.js 쿼리 파라미터는 ncpKeyId 사용.
 * @see https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html
 */
export function naverMapsScriptUrl(
  clientId: string,
  callbackName?: string,
  opts?: { panorama?: boolean },
): string {
  const url = new URL("https://oapi.map.naver.com/openapi/v3/maps.js");
  url.searchParams.set("ncpKeyId", clientId);
  const submodules: string[] = [];
  if (usesNaverCustomStyle()) submodules.push("gl");
  // 거리뷰(파노라마)는 거리뷰 모달 진입 시에만 지연 로드한다(모든 지도 페이지 비용 제거).
  if (opts?.panorama) submodules.push("panorama");
  if (submodules.length) url.searchParams.set("submodules", submodules.join(","));
  if (callbackName) {
    url.searchParams.set("callback", callbackName);
  }
  return url.toString();
}

type NaverMapsWindow = Window & {
  navermap_authFailure?: () => void;
  __woodongNaverMapsReady?: () => void;
};

function asNaverWindow(): NaverMapsWindow {
  return window as unknown as NaverMapsWindow;
}

export function installNaverMapAuthFailureHandler(onFailure: () => void): void {
  if (typeof window === "undefined") return;
  authFailed = false;
  asNaverWindow().navermap_authFailure = () => {
    authFailed = true;
    onFailure();
  };
}

export function getNaverMapsScriptElementId(): string {
  return usesNaverCustomStyle() ? `${NAVER_MAPS_SCRIPT_ID}-gl` : NAVER_MAPS_SCRIPT_ID;
}

/** 레거시 ncpClientId 파라미터로 로드된 script 태그 제거 */
function removeLegacyNaverScripts(): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll('script[src*="oapi.map.naver.com/openapi/v3/maps.js"]').forEach((el) => {
    const src = (el as HTMLScriptElement).src;
    if (src.includes("ncpClientId=") || src.includes("govClientId=") || src.includes("finClientId=")) {
      el.remove();
    }
  });
}

/**
 * 줌 범위 제한 — 한국 부동산 지도라 전국(약 6)보다 더 축소(세계 지도)되거나
 * 네이버 최대(21)를 넘지 않도록 클램프한다.
 * @see https://navermaps.github.io/maps.js.ncp/docs/index.html (MapOptions: minZoom/maxZoom)
 */
export const NAVER_MAP_MIN_ZOOM = 6;
export const NAVER_MAP_MAX_ZOOM = 21;

export type NaverMapInitOptions = {
  center: unknown;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  gl?: boolean;
  customStyleId?: string;
  customStyleVersion?: string;
  /** @see https://navermaps.github.io/maps.js.ncp/docs/tutorial-digest.example.html */
  zoomControl?: boolean;
  mapTypeControl?: boolean;
  scaleControl?: boolean;
  zoomControlOptions?: { position?: unknown };
  mapTypeControlOptions?: { style?: unknown; position?: unknown };
};

export function buildNaverMapInitOptions(
  center: unknown,
  level = 8,
  opts?: { showControls?: boolean; minZoom?: number; maxZoom?: number },
): NaverMapInitOptions {
  const showControls = opts?.showControls !== false;
  const minZoom = opts?.minZoom ?? NAVER_MAP_MIN_ZOOM;
  const maxZoom = opts?.maxZoom ?? NAVER_MAP_MAX_ZOOM;
  const init: NaverMapInitOptions = {
    center,
    zoom: Math.min(maxZoom, Math.max(minZoom, mapLevelToNaverZoom(level))),
    minZoom,
    maxZoom,
    zoomControl: showControls,
    mapTypeControl: showControls,
    scaleControl: showControls,
  };
  // GL 커스텀 스타일은 스크립트에서 gl 서브모듈을 로드한 경우(=두 플래그 모두 on)에만 켠다.
  // STYLE_ID만 설정되고 USE_CUSTOM_STYLE 이 꺼져 있으면 gl 서브모듈이 없어 회색(빈) 지도가 된다.
  if (usesNaverCustomStyle()) {
    init.gl = true;
    init.customStyleId = NAVER_MAP_STYLE_ID;
    if (NAVER_MAP_STYLE_VERSION) {
      init.customStyleVersion = NAVER_MAP_STYLE_VERSION;
    }
  }
  return init;
}

/** 공식 예제 — 줌·지도유형·축척 컨트롤 위치 */
export function applyNaverMapControlPositions(
  opts: NaverMapInitOptions,
  maps: NaverMapsApi,
): NaverMapInitOptions {
  if (!opts.zoomControl && !opts.mapTypeControl) return opts;
  const pos = maps.Position?.TOP_RIGHT;
  if (pos) {
    opts.zoomControlOptions = { position: pos };
    opts.mapTypeControlOptions = {
      style: maps.MapTypeControlStyle?.DROPDOWN,
      position: pos,
    };
  }
  return opts;
}

type NaverMapsApi = {
  Map: new (el: HTMLElement | string, opts: NaverMapInitOptions) => NaverMapInstance;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds: new (sw: unknown, ne: unknown) => unknown;
  Point: new (x: number, y: number) => unknown;
  Marker: new (opts: {
    position: unknown;
    map?: NaverMapInstance | null;
    title?: string;
    icon?: { content?: string; anchor?: unknown };
    zIndex?: number;
  }) => NaverMarker;
  InfoWindow: new (opts: { content: string }) => NaverInfoWindow;
  TrafficLayer: new () => NaverLayer;
  CadastralLayer: new () => NaverLayer;
  BicycleLayer: new () => NaverLayer;
  Circle: new (opts: {
    map?: NaverMapInstance | null;
    center: unknown;
    radius: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
    fillColor?: string;
    fillOpacity?: number;
  }) => NaverOverlay;
  Panorama?: new (
    el: HTMLElement,
    opts: { position: unknown; pov?: { pan: number; tilt: number; fov: number }; visible?: boolean },
  ) => NaverPanorama;
  Event: {
    addListener: (target: unknown, type: string, handler: (...args: unknown[]) => void) => void;
  };
  Position?: { TOP_RIGHT: unknown; RIGHT_CENTER: unknown };
  MapTypeControlStyle?: { DROPDOWN: unknown };
  MapTypeId?: { NORMAL: string; SATELLITE: string; HYBRID: string; TERRAIN: string };
};

export type NaverLatLngValue = { lat: () => number; lng: () => number };

export type NaverBounds = {
  getSW?: () => NaverLatLngValue;
  getNE?: () => NaverLatLngValue;
  hasLatLng?: (latlng: unknown) => boolean;
};

export type NaverOverlay = {
  setMap: (map: NaverMapInstance | null) => void;
};

export type NaverPanorama = {
  setPosition?: (position: unknown) => void;
  setVisible?: (visible: boolean) => void;
  destroy?: () => void;
};

export type NaverLayer = {
  setMap: (map: NaverMapInstance | null) => void;
};

export type NaverMapInstance = {
  setCenter: (c: unknown) => void;
  setZoom: (z: number) => void;
  fitBounds: (bounds: unknown, opts?: { top?: number; right?: number; bottom?: number; left?: number }) => void;
  getSize?: () => { width: number; height: number };
  refresh?: () => void;
  getBounds?: () => NaverBounds;
  getZoom?: () => number;
  getCenter?: () => NaverLatLngValue;
  setMapTypeId?: (id: string) => void;
  destroy?: () => void;
};

export type NaverMarker = {
  setMap: (map: NaverMapInstance | null) => void;
  setPosition?: (position: unknown) => void;
  setIcon?: (icon: { content?: string; anchor?: unknown }) => void;
  setZIndex?: (zIndex: number) => void;
};

export type NaverInfoWindow = {
  open: (map: NaverMapInstance, marker: NaverMarker) => void;
  close: () => void;
};

export function getNaverMapsWindow(): Window & { naver?: { maps: NaverMapsApi } } {
  return window as Window & { naver?: { maps: NaverMapsApi } };
}

export function loadNaverMapsScript(
  clientId: string,
  opts?: { onAuthFailure?: () => void },
): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (!clientId.trim()) {
    return Promise.reject(new Error("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID 가 설정되지 않았습니다."));
  }

  if (opts?.onAuthFailure) {
    installNaverMapAuthFailureHandler(opts.onAuthFailure);
  }

  const win = getNaverMapsWindow();
  if (win.naver?.maps) {
    return Promise.resolve();
  }
  if (naverMapsLoadPromise) {
    return naverMapsLoadPromise;
  }

  removeLegacyNaverScripts();

  naverMapsLoadPromise = new Promise((resolve, reject) => {
    const rejectOnce = (err: Error) => {
      naverMapsLoadPromise = null;
      reject(err);
    };

    const waitForMaps = () => {
      const startedAt = Date.now();
      const tick = () => {
        if (authFailed) {
          rejectOnce(new Error(NAVER_MAP_AUTH_FAILURE_MESSAGE));
          return;
        }
        if (getNaverMapsWindow().naver?.maps) {
          resolve();
          return;
        }
        if (Date.now() - startedAt > NAVER_MAPS_READY_TIMEOUT_MS) {
          rejectOnce(new Error("네이버 지도 SDK 로드 시간 초과"));
          return;
        }
        window.setTimeout(tick, 50);
      };
      tick();
    };

    // 콜백(callback 파라미터)·script.onload 중 무엇이 먼저 와도 폴링을 한 번만 시작한다.
    // (인증 실패 등으로 named callback 이 끝내 호출되지 않아도 onload 가 타임아웃 폴링을 보장)
    let waitStarted = false;
    const startWait = () => {
      if (waitStarted) return;
      waitStarted = true;
      waitForMaps();
    };

    const scriptId = getNaverMapsScriptElementId();
    const expectedUrl = naverMapsScriptUrl(clientId, NAVER_MAPS_CALLBACK);
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (existing) {
      const srcOk =
        existing.src.includes("ncpKeyId=") && existing.src.includes(clientId);
      if (!srcOk) {
        existing.remove();
        delete asNaverWindow().__woodongNaverMapsReady;
      } else {
        startWait();
        return;
      }
    }

    asNaverWindow().__woodongNaverMapsReady = () => {
      delete asNaverWindow().__woodongNaverMapsReady;
      startWait();
    };

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.src = expectedUrl;
    // named callback 이 호출되지 않는 경우를 대비한 안전망(중복은 startWait 가드로 무시).
    script.onload = () => startWait();
    script.onerror = () => {
      delete asNaverWindow().__woodongNaverMapsReady;
      rejectOnce(new Error("네이버 지도 SDK 스크립트 로드 실패"));
    };
    document.head.appendChild(script);
  });

  return naverMapsLoadPromise;
}

let panoramaLoadPromise: Promise<void> | null = null;

/**
 * 거리뷰(파노라마) 서브모듈을 지연 로드한다.
 * 기본 SDK는 panorama 없이 로드되므로, 거리뷰 모달 진입 시 한 번만 호출한다.
 */
export function ensureNaverPanorama(clientId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (getNaverMapsWindow().naver?.maps?.Panorama) return Promise.resolve();
  if (panoramaLoadPromise) return panoramaLoadPromise;
  if (!clientId.trim()) {
    return Promise.reject(new Error("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID 가 설정되지 않았습니다."));
  }

  panoramaLoadPromise = new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const poll = () => {
      if (getNaverMapsWindow().naver?.maps?.Panorama) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > NAVER_MAPS_READY_TIMEOUT_MS) {
        panoramaLoadPromise = null;
        reject(new Error("거리뷰(파노라마) 서브모듈 로드 시간 초과"));
        return;
      }
      window.setTimeout(poll, 50);
    };

    const id = `${NAVER_MAPS_SCRIPT_ID}-panorama`;
    if (document.getElementById(id)) {
      poll();
      return;
    }
    const url = new URL("https://oapi.map.naver.com/openapi/v3/maps.js");
    url.searchParams.set("ncpKeyId", clientId);
    url.searchParams.set("submodules", "panorama");
    const script = document.createElement("script");
    script.id = id;
    script.async = true;
    script.src = url.toString();
    script.onload = poll;
    script.onerror = () => {
      panoramaLoadPromise = null;
      reject(new Error("거리뷰(파노라마) 서브모듈 로드 실패"));
    };
    document.head.appendChild(script);
  });

  return panoramaLoadPromise;
}
