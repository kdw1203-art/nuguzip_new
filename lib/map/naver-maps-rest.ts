import crypto from "node:crypto";

import { resolveNaverMapClientId } from "@/lib/map/naver-maps-sdk";

/** @see https://api.ncloud-docs.com/docs/application-maps-overview */
export const NAVER_MAPS_REST_DOCS_URL =
  "https://api.ncloud-docs.com/docs/application-maps-overview";

/**
 * NCP 계정 IAM 인증키(`ncp_iam_…` Access Key ID + Secret Key).
 * 있으면 `common-ncpapi` 시그니처(HMAC-SHA256) 인증을 사용한다.
 * @see https://api.ncloud-docs.com/docs/common-ncpapi
 */
function resolveNcpAccessKey(): string {
  return (
    process.env.NCP_MAPS_ACCESS_KEY?.trim() ||
    process.env.NCP_ACCESS_KEY?.trim() ||
    ""
  );
}

function resolveNcpSecretKey(): string {
  return (
    process.env.NCP_MAPS_SECRET_KEY?.trim() ||
    process.env.NCP_SECRET_KEY?.trim() ||
    ""
  );
}

/** IAM 시그니처 인증 사용 가능 여부 (Access + Secret 둘 다 존재). */
function isSignatureMode(): boolean {
  return Boolean(resolveNcpAccessKey() && resolveNcpSecretKey());
}

/**
 * REST API 베이스 URL.
 * - IAM 시그니처 모드(신규 NCP Maps): `maps.apigw.ntruss.com`
 * - 단순 키 헤더 모드(AI·NAVER API classic, `asc1mlqmra` 등): `naveropenapi.apigw.ntruss.com`
 * `NAVER_MAP_REST_BASE_URL` 로 재정의 가능.
 * @see https://api.ncloud-docs.com/docs/application-maps-overview (API URL)
 */
function resolveRestBaseUrl(): string {
  const override = process.env.NAVER_MAP_REST_BASE_URL?.trim().replace(/\/$/, "");
  if (override) return override;
  return isSignatureMode()
    ? "https://maps.apigw.ntruss.com"
    : "https://naveropenapi.apigw.ntruss.com";
}

const GEOCODE_PATH = "/map-geocode/v2/geocode";
const REVERSE_GEOCODE_PATH = "/map-reversegeocode/v2/gc";

export type NaverGeocodeItem = {
  address: string;
  roadAddress?: string;
  jibunAddress?: string;
  lat: number;
  lng: number;
};

/**
 * 지도 REST(Geocoding/Reverse Geocoding/Static Map) 전용 키.
 * NCP 'AI·NAVER API' 콘솔 키가 브라우저 동적지도(ncpKeyId)와 다를 수 있어 별도 변수로 분리.
 * 미설정 시 브라우저 지도 키(NEXT_PUBLIC_NAVER_MAP_CLIENT_ID)로 폴백.
 */
function resolveRestKeyId(): string {
  return (
    process.env.NAVER_MAP_REST_KEY_ID?.trim() ||
    resolveNaverMapClientId() ||
    ""
  );
}

function resolveRestSecret(): string {
  return (
    process.env.NAVER_MAP_REST_KEY?.trim() ||
    process.env.NAVER_MAP_CLIENT_SECRET?.trim() ||
    ""
  );
}

export function isNaverMapsRestConfigured(): boolean {
  if (isSignatureMode()) return true;
  return Boolean(resolveRestKeyId() && resolveRestSecret());
}

/**
 * NCP API Gateway v2 시그니처 생성.
 * message = METHOD + " " + path(+query) + "\n" + timestamp + "\n" + accessKey
 * @see https://api.ncloud-docs.com/docs/common-ncpapi
 */
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

/** 요청 path(+쿼리)에 맞는 인증 헤더와 최종 URL을 반환. */
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

const STATIC_MAP_PATH = "/map-static/v2/raster";

/**
 * 네이버 Static Map 이미지를 data URI(base64 PNG)로 반환.
 * 키 미설정·좌표 이상·실패 시 null (OG 카드 등에서 지도 없는 버전으로 폴백).
 * @param lat 위도, @param lng 경도
 */
export async function fetchStaticMapDataUri(
  lat: number,
  lng: number,
  opts: { w?: number; h?: number; level?: number; marker?: boolean } = {},
): Promise<string | null> {
  if (!isNaverMapsRestConfigured()) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const w = Math.min(Math.max(Math.round(opts.w ?? 440), 100), 1024);
  const h = Math.min(Math.max(Math.round(opts.h ?? 280), 100), 1024);
  const level = Math.min(Math.max(Math.round(opts.level ?? 15), 6), 20);

  const params = new URLSearchParams({
    w: String(w),
    h: String(h),
    center: `${lng},${lat}`,
    level: String(level),
    format: "png",
    scale: "2",
  });
  if (opts.marker !== false) {
    params.set("markers", `type:d|size:mid|color:0x1d4fd8|pos:${lng} ${lat}`);
  }

  try {
    const { url, headers } = buildRequest(STATIC_MAP_PATH, params);
    const res = await fetch(url, {
      headers: { ...headers, Accept: "image/png" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null;
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

type GeocodeAddress = {
  roadAddress?: string;
  jibunAddress?: string;
  x?: string;
  y?: string;
};

type GeocodeResponse = {
  status?: string;
  addresses?: GeocodeAddress[];
};

type ReverseRegion = {
  area1?: { name?: string };
  area2?: { name?: string };
  area3?: { name?: string };
  area4?: { name?: string };
};

type ReverseLand = {
  name?: string;
  number1?: string;
  number2?: string;
};

type ReverseResult = {
  name?: string;
  region?: ReverseRegion;
  land?: ReverseLand;
};

type ReverseGeocodeResponse = {
  status?: { code?: number; message?: string };
  results?: ReverseResult[];
};

function formatReverseAddress(result: ReverseResult): string {
  const region = result.region;
  const land = result.land;
  const parts = [
    region?.area1?.name,
    region?.area2?.name,
    region?.area3?.name,
    region?.area4?.name,
    land?.name,
    land?.number1,
    land?.number2 ? `-${land.number2}` : "",
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function pickAddress(row: GeocodeAddress): string {
  return (row.roadAddress ?? row.jibunAddress ?? "").trim();
}

/** 주소 → 좌표. @see https://api.ncloud-docs.com/docs/application-maps-geocoding */
export async function naverGeocode(
  query: string,
  limit = 5,
): Promise<NaverGeocodeItem[]> {
  if (!isNaverMapsRestConfigured()) {
    throw new Error("NAVER Maps REST API credentials not configured");
  }

  const params = new URLSearchParams();
  params.set("query", query.trim());
  params.set("count", String(Math.min(10, Math.max(1, limit))));

  const { url, headers } = buildRequest(GEOCODE_PATH, params);
  const res = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status})`);
  }

  const json = (await res.json()) as GeocodeResponse;
  const items: NaverGeocodeItem[] = [];
  for (const row of json.addresses ?? []) {
    const lat = Number.parseFloat(String(row.y ?? ""));
    const lng = Number.parseFloat(String(row.x ?? ""));
    const address = pickAddress(row);
    if (!address || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    items.push({
      address,
      roadAddress: row.roadAddress?.trim() || undefined,
      jibunAddress: row.jibunAddress?.trim() || undefined,
      lat,
      lng,
    });
  }
  return items;
}

/** 좌표 → 주소. @see https://api.ncloud-docs.com/docs/application-maps-reversegeocoding */
export async function naverReverseGeocode(
  lat: number,
  lng: number,
): Promise<NaverGeocodeItem | null> {
  if (!isNaverMapsRestConfigured()) {
    throw new Error("NAVER Maps REST API credentials not configured");
  }

  const params = new URLSearchParams();
  params.set("coords", `${lng},${lat}`);
  params.set("output", "json");
  params.set("orders", "roadaddr,addr");

  const { url, headers } = buildRequest(REVERSE_GEOCODE_PATH, params);
  const res = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Reverse geocoding failed (${res.status})`);
  }

  const json = (await res.json()) as ReverseGeocodeResponse;
  const statusCode = json.status?.code;
  // 0 = ok, 3 = no results (성공이지만 결과 없음) → null 반환. 그 외는 오류.
  if (statusCode === 3) return null;
  if (statusCode !== undefined && statusCode !== 0) {
    throw new Error(json.status?.message ?? "Reverse geocoding error");
  }

  const result = json.results?.find((r) => formatReverseAddress(r).length > 0);
  if (!result) return null;

  const address = formatReverseAddress(result);
  if (!address) return null;

  return {
    address,
    lat,
    lng,
    roadAddress: result.name === "roadaddr" ? address : undefined,
    jibunAddress: result.name === "addr" ? address : undefined,
  };
}
