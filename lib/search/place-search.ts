import "server-only";

import { logger } from "@/lib/log";
import { naverGeocode, type NaverGeocodeItem } from "@/lib/map/naver-maps-rest";

/* ============================================================
   외부 실시간 장소 검색 폴백 — 지도 아파트 검색 보완.
   내부 complexes 테이블이 비어 있을 때 Kakao/Naver 키워드 장소
   검색으로 아파트명·건물명 등을 실시간으로 보충한다.

   - 완전 env-gated: 키 미설정 시 no-op ([] 반환) → 아무것도 깨지지 않음.
   - Kakao 우선(WGS84 좌표를 직접 반환 → 이동 부위 적음).
   - Naver 는 mapx/mapy 가 KATECH TM128(서버 변환 불안정)이라 신뢰하지 않고,
     roadAddress(또는 address)를 내부 지오코더(naverGeocode)로 WGS84 변환한다.
     변환 실패한 항목은 제외한다.
   - 절대 throw 하지 않음(try/catch → []). fetch 에는 revalidate 3600 캐시.
   ============================================================ */

const KAKAO_ENDPOINT = "https://dapi.kakao.com/v2/local/search/keyword.json";
const NAVER_ENDPOINT = "https://openapi.naver.com/v1/search/local.json";
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;

export type PlaceResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  source: "kakao" | "naver";
};

function kakaoKey(): string {
  return process.env.KAKAO_REST_KEY?.trim() ?? "";
}

function naverCreds(): { id: string; secret: string } {
  return {
    id: process.env.NAVER_SEARCH_CLIENT_ID?.trim() ?? "",
    secret: process.env.NAVER_SEARCH_CLIENT_SECRET?.trim() ?? "",
  };
}

/** Kakao 또는 Naver 키가 설정돼 있으면 true. 둘 다 없으면 no-op. */
export function isPlaceSearchConfigured(): boolean {
  if (kakaoKey()) return true;
  const { id, secret } = naverCreds();
  return Boolean(id && secret);
}

/** HTML 태그·기본 엔티티 제거 (Naver title 의 <b> 하이라이트 정리). */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Kakao (선호) — WGS84 좌표 직접 제공 ────────────────────────────────

type KakaoDoc = {
  place_name?: string;
  road_address_name?: string;
  address_name?: string;
  x?: string; // lng
  y?: string; // lat
};

type KakaoResponse = { documents?: KakaoDoc[] };

async function searchKakao(query: string, limit: number): Promise<PlaceResult[]> {
  const key = kakaoKey();
  if (!key) return [];

  const url = `${KAKAO_ENDPOINT}?query=${encodeURIComponent(query)}&size=8`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    logger.warn("[place-search.kakao] non-ok response", res.status);
    return [];
  }

  const json = (await res.json()) as KakaoResponse;
  const out: PlaceResult[] = [];
  for (const d of json.documents ?? []) {
    const name = (d.place_name ?? "").trim();
    const address = (d.road_address_name || d.address_name || "").trim();
    const lat = Number.parseFloat(String(d.y ?? ""));
    const lng = Number.parseFloat(String(d.x ?? ""));
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ name, address, lat, lng, source: "kakao" });
    if (out.length >= limit) break;
  }
  return out;
}

// ── Naver (보조) — mapx/mapy 대신 주소 → 내부 지오코더로 WGS84 변환 ──────

type NaverItem = {
  title?: string;
  roadAddress?: string;
  address?: string;
};

type NaverResponse = { items?: NaverItem[] };

async function searchNaver(query: string, limit: number): Promise<PlaceResult[]> {
  const { id, secret } = naverCreds();
  if (!id || !secret) return [];

  const url = `${NAVER_ENDPOINT}?query=${encodeURIComponent(query)}&display=5`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": id,
      "X-Naver-Client-Secret": secret,
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    logger.warn("[place-search.naver] non-ok response", res.status);
    return [];
  }

  const json = (await res.json()) as NaverResponse;
  const out: PlaceResult[] = [];
  for (const it of json.items ?? []) {
    const name = stripHtml(it.title ?? "");
    const addr = (it.roadAddress || it.address || "").trim();
    if (!name || !addr) continue;

    // TM128(mapx/mapy) 미신뢰 → 주소를 내부 지오코더로 WGS84 변환.
    let geo: NaverGeocodeItem | undefined;
    try {
      const items = await naverGeocode(addr, 1);
      geo = items[0];
    } catch (e) {
      logger.warn("[place-search.naver] geocode failed", e);
    }
    if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) continue;

    out.push({
      name,
      address: geo.address || addr,
      lat: geo.lat,
      lng: geo.lng,
      source: "naver",
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 외부 장소 검색. 키 미설정 시 [], 실패 시 [] (never throws).
 * finite lat/lng 를 가진 항목만 반환하고 limit(기본 6)로 캡한다.
 * Kakao 가 설정돼 있으면 Kakao 우선(직접 좌표), 아니면 Naver.
 */
export async function searchPlaces(query: string, limit = DEFAULT_LIMIT): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q || !isPlaceSearchConfigured()) return [];
  const cap = Math.min(Math.max(1, limit), MAX_LIMIT);

  try {
    if (kakaoKey()) return await searchKakao(q, cap);
    return await searchNaver(q, cap);
  } catch (e) {
    logger.warn("[place-search] searchPlaces failed", e);
    return [];
  }
}
