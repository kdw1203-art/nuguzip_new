import "server-only";

import crypto from "node:crypto";

import { resolveNaverMapClientId } from "@/lib/map/naver-maps-sdk";
import { haversineDistanceM } from "@/lib/map/geo-haversine";
import { logger } from "@/lib/log";

/**
 * NCP Maps Directions(자동차 길찾기) 클라이언트 — 출퇴근 소요시간 추정용.
 *
 * 인증/베이스 URL 방식은 `lib/map/naver-maps-rest.ts`(Geocoding)와 동일하다:
 *  - IAM 시그니처(Access+Secret) 모드면 `maps.apigw.ntruss.com`
 *  - 단순 키 헤더 모드면 `naveropenapi.apigw.ntruss.com`
 *
 * **서버 전용**: `import "server-only"` 로 클라이언트 번들 유입을 막는다.
 * 반드시 API 라우트(/api/map/commute)에서만 호출한다.
 *
 * 미설정이거나 어떤 오류든 발생하면 throw 하지 않고 haversine 직선거리 기반
 * 추정으로 폴백한다(정확 소요시간은 연동 시).
 *
 * @see https://api.ncloud-docs.com/docs/application-maps-directions15
 */

const DIRECTIONS_PATH = "/map-direction/v1/driving";

/** 도심 평균 주행 속도(km/h) — 직선거리 폴백 추정 시 사용 */
const URBAN_AVG_SPEED_KMH = 22;

export type CommuteBasis = "directions" | "haversine";

type LatLng = { lat: number; lng: number };

function resolveNcpAccessKey(): string {
  return (
    process.env.NCP_MAPS_ACCESS_KEY?.trim() || process.env.NCP_ACCESS_KEY?.trim() || ""
  );
}

function resolveNcpSecretKey(): string {
  return (
    process.env.NCP_MAPS_SECRET_KEY?.trim() || process.env.NCP_SECRET_KEY?.trim() || ""
  );
}

function isSignatureMode(): boolean {
  return Boolean(resolveNcpAccessKey() && resolveNcpSecretKey());
}

function resolveRestKeyId(): string {
  return process.env.NAVER_MAP_REST_KEY_ID?.trim() || resolveNaverMapClientId() || "";
}

function resolveRestSecret(): string {
  return (
    process.env.NAVER_MAP_REST_KEY?.trim() ||
    process.env.NAVER_MAP_CLIENT_SECRET?.trim() ||
    ""
  );
}

function resolveRestBaseUrl(): string {
  const override = process.env.NAVER_MAP_REST_BASE_URL?.trim().replace(/\/$/, "");
  if (override) return override;
  return isSignatureMode()
    ? "https://maps.apigw.ntruss.com"
    : "https://naveropenapi.apigw.ntruss.com";
}

/**
 * Directions 연동 가능 여부 — geocode 클라이언트(isNaverMapsRestConfigured)와 동일 조건.
 * (IAM 시그니처 모드 이거나, REST Key Id + Secret 둘 다 존재)
 */
export function isDirectionsConfigured(): boolean {
  if (isSignatureMode()) return true;
  return Boolean(resolveRestKeyId() && resolveRestSecret());
}

function makeSignature(
  method: string,
  pathWithQuery: string,
  timestamp: string,
  accessKey: string,
  secretKey: string,
): string {
  const message = `${method} ${pathWithQuery}\n${timestamp}\n${accessKey}`;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

function buildRequest(
  path: string,
  params: URLSearchParams,
): { url: string; headers: Record<string, string> } {
  const base = resolveRestBaseUrl();
  const qs = params.toString();
  const pathWithQuery = qs ? `${path}?${qs}` : path;
  const url = `${base}${pathWithQuery}`;

  if (isSignatureMode()) {
    const accessKey = resolveNcpAccessKey();
    const secretKey = resolveNcpSecretKey();
    const timestamp = String(Date.now());
    const signature = makeSignature("GET", pathWithQuery, timestamp, accessKey, secretKey);
    return {
      url,
      headers: {
        Accept: "application/json",
        "x-ncp-apigw-timestamp": timestamp,
        "x-ncp-iam-access-key": accessKey,
        "x-ncp-apigw-signature-v2": signature,
      },
    };
  }

  return {
    url,
    headers: {
      Accept: "application/json",
      "x-ncp-apigw-api-key-id": resolveRestKeyId(),
      "x-ncp-apigw-api-key": resolveRestSecret(),
    },
  };
}

type DirectionsSummary = { duration?: number; distance?: number };
type DirectionsRoutePath = {
  summary?: DirectionsSummary;
  path?: [number, number][];
};
type DirectionsResponse = {
  code?: number;
  route?: Record<string, DirectionsRoutePath[] | undefined>;
};

export type RoutePathResult = {
  path: LatLng[];
  distanceM: number;
  durationMin: number;
  basis: "directions" | "estimate";
};

function pickRoute(json: DirectionsResponse): DirectionsRoutePath | null {
  const route = json.route ?? {};
  const paths =
    route.trafast ?? route.traoptimal ?? route.tracomfort ?? Object.values(route)[0];
  return paths?.[0] ?? null;
}

function pathFromRoute(entry: DirectionsRoutePath): LatLng[] {
  const raw = entry.path ?? [];
  const out: LatLng[] = [];
  for (const pt of raw) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ lat, lng });
  }
  return out;
}

/** 직선거리(haversine) → 도심 평균속도 기반 분 추정 (최소 1분) */
function haversineMinutes(from: LatLng, to: LatLng): number {
  const meters = haversineDistanceM(from.lat, from.lng, to.lat, to.lng);
  const km = meters / 1000;
  const minutes = (km / URBAN_AVG_SPEED_KMH) * 60;
  return Math.max(1, Math.round(minutes));
}

/** 실제 Directions API 호출 → 분(성공 시). 실패/파싱불가 시 null. */
async function callDirections(from: LatLng, to: LatLng): Promise<number | null> {
  const full = await fetchDrivingRoute(from, to);
  return full?.basis === "directions" ? full.durationMin : null;
}

/**
 * 자동차 경로(좌표열·거리·시간). Directions 연동 시 도로 경로, 아니면 null.
 * 지도 거리 재기 점선 오버레이용 — commute 추정과는 별도로 path 가 필요하다.
 */
export async function fetchDrivingRoute(
  from: LatLng,
  to: LatLng,
  option: "trafast" | "traoptimal" | "traavoidcaronly" = "traoptimal",
): Promise<RoutePathResult | null> {
  if (!isDirectionsConfigured()) return null;
  try {
    const params = new URLSearchParams();
    params.set("start", `${from.lng},${from.lat}`);
    params.set("goal", `${to.lng},${to.lat}`);
    params.set("option", option);

    const { url, headers } = buildRequest(DIRECTIONS_PATH, params);
    const res = await fetch(url, { headers, next: { revalidate: 900 } });
    if (!res.ok) return null;

    const json = (await res.json()) as DirectionsResponse;
    if (json.code != null && json.code !== 0) return null;
    const entry = pickRoute(json);
    if (!entry) return null;

    const path = pathFromRoute(entry);
    const distanceM = Number(entry.summary?.distance);
    const durationMs = Number(entry.summary?.duration);
    if (!Number.isFinite(distanceM) || distanceM <= 0) return null;
    if (path.length < 2) {
      return {
        path: [from, to],
        distanceM: Math.round(distanceM),
        durationMin: Math.max(1, Math.round((durationMs || 0) / 60_000)),
        basis: "directions",
      };
    }
    return {
      path,
      distanceM: Math.round(distanceM),
      durationMin: Math.max(1, Math.round((durationMs || 0) / 60_000)),
      basis: "directions",
    };
  } catch (e) {
    logger.warn("[map/directions] 경로 path 조회 실패", e);
    return null;
  }
}

/** 도보 추정 — NCP Directions 5 는 자동차 전용이라, 직선×우회계수 + 보행 속도로 표시. */
export function estimateWalkingRoute(from: LatLng, to: LatLng): RoutePathResult {
  const straight = haversineDistanceM(from.lat, from.lng, to.lat, to.lng);
  /* 도로·횡단 우회를 감안해 직선×1.25. 가짜 도로 경로를 그리지 않고 점선 직선으로 표시. */
  const distanceM = Math.round(straight * 1.25);
  const WALK_KMH = 4.5;
  const durationMin = Math.max(1, Math.round((distanceM / 1000 / WALK_KMH) * 60));
  return {
    path: [from, to],
    distanceM,
    durationMin,
    basis: "estimate",
  };
}

/**
 * 두 좌표 간 예상 출퇴근(자동차) 소요시간(분).
 * 연동 설정 시 실제 Directions API, 아니면(또는 오류 시) haversine 직선거리 추정.
 * 절대 throw 하지 않는다.
 */
export async function estimateCommuteMinutes(
  from: LatLng,
  to: LatLng,
): Promise<{ minutes: number; basis: CommuteBasis }> {
  if (isDirectionsConfigured()) {
    try {
      const minutes = await callDirections(from, to);
      if (minutes !== null) return { minutes, basis: "directions" };
    } catch (e) {
      logger.warn("[map/directions] Directions 호출 실패 — haversine 폴백", e);
    }
  }
  return { minutes: haversineMinutes(from, to), basis: "haversine" };
}
