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

type DirectionsSummary = { duration?: number };
type DirectionsRoutePath = { summary?: DirectionsSummary };
type DirectionsResponse = {
  code?: number;
  route?: Record<string, DirectionsRoutePath[] | undefined>;
};

/** 직선거리(haversine) → 도심 평균속도 기반 분 추정 (최소 1분) */
function haversineMinutes(from: LatLng, to: LatLng): number {
  const meters = haversineDistanceM(from.lat, from.lng, to.lat, to.lng);
  const km = meters / 1000;
  const minutes = (km / URBAN_AVG_SPEED_KMH) * 60;
  return Math.max(1, Math.round(minutes));
}

/** 실제 Directions API 호출 → 분(성공 시). 실패/파싱불가 시 null. */
async function callDirections(from: LatLng, to: LatLng): Promise<number | null> {
  const params = new URLSearchParams();
  params.set("start", `${from.lng},${from.lat}`);
  params.set("goal", `${to.lng},${to.lat}`);
  params.set("option", "trafast");

  const { url, headers } = buildRequest(DIRECTIONS_PATH, params);
  const res = await fetch(url, { headers, next: { revalidate: 1800 } });
  if (!res.ok) return null;

  const json = (await res.json()) as DirectionsResponse;
  const route = json.route ?? {};
  // 요청 옵션에 따라 traoptimal/trafast/tracomfort 중 하나로 반환됨 — 존재하는 첫 배열 사용.
  const paths =
    route.trafast ?? route.traoptimal ?? route.tracomfort ?? Object.values(route)[0];
  const durationMs = paths?.[0]?.summary?.duration;
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  return Math.max(1, Math.round(durationMs / 60_000));
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
