import { logger } from "@/lib/log";

export type KakaoLocalPlace = {
  id: string;
  name: string;
  category: string;
  address: string;
  roadAddress: string;
  phone: string;
  placeUrl: string;
  lat: number;
  lng: number;
  distanceM: number | null;
};

export type KakaoLocalSearchResult = {
  items: KakaoLocalPlace[];
  httpStatus?: number;
  errorCode?: string;
};

/** 서버 전용 Kakao REST API 키 (Local Search 등) */
export function getKakaoRestApiKey(): string | null {
  const key =
    process.env.KAKAO_REST_API_KEY?.trim() ||
    process.env.KAKAO_LOCAL_API_KEY?.trim() ||
    null;
  return key || null;
}

export async function kakaoLocalKeywordSearch(params: {
  query: string;
  lat: number;
  lng: number;
  radiusM?: number;
  size?: number;
}): Promise<KakaoLocalSearchResult> {
  const key = getKakaoRestApiKey();
  if (!key) return { items: [], errorCode: "missing_key" };

  const radius = Math.min(20_000, Math.max(500, params.radiusM ?? 1000));
  const size = Math.min(15, Math.max(1, params.size ?? 5));
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", params.query);
  url.searchParams.set("x", String(params.lng));
  url.searchParams.set("y", String(params.lat));
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("sort", "distance");
  url.searchParams.set("size", String(size));

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${key}` },
      cache: "no-store",
    });
  } catch (e) {
    logger.warn("[kakao:local] fetch failed", e);
    return { items: [], errorCode: "network_error" };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn("[kakao:local] HTTP", res.status, body.slice(0, 200));
    return {
      items: [],
      httpStatus: res.status,
      errorCode: res.status === 401 ? "invalid_key" : `http_${res.status}`,
    };
  }

  const data = (await res.json()) as {
    documents?: Array<{
      id: string;
      place_name: string;
      category_name: string;
      address_name: string;
      road_address_name: string;
      phone: string;
      place_url: string;
      x: string;
      y: string;
      distance?: string;
    }>;
  };

  const items = (data.documents ?? []).map((d) => ({
    id: d.id,
    name: d.place_name,
    category: d.category_name,
    address: d.address_name,
    roadAddress: d.road_address_name || d.address_name,
    phone: d.phone,
    placeUrl: d.place_url,
    lat: Number(d.y),
    lng: Number(d.x),
    distanceM: d.distance ? Number(d.distance) : null,
  }));

  return { items };
}
