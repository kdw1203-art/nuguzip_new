import { getServiceSupabase } from "@/lib/supabase/service";
import { bboxForRadius, haversineDistanceM } from "@/lib/map/geo-haversine";

export type NearbyProviderItem = {
  id: string;
  provider_type: string;
  display_name: string;
  office_name: string | null;
  address: string | null;
  phone: string | null;
  verified_status: "verified" | "pending";
  distance_m: number;
  href: string;
};

/** 업종 문자열 → provider_type. expert_profiles 에 provider_type 컬럼이 없어 유추한다. */
export function mapCategoryToProviderType(category: string): string {
  if (/중개|공인/.test(category)) return "broker";
  if (/변호/.test(category)) return "lawyer";
  if (/법무/.test(category)) return "judicial_scrivener";
  if (/세무|회계/.test(category)) return "tax_accountant";
  return "other";
}

export async function findNearbyProviders(input: {
  lat: number;
  lng: number;
  radiusM?: number;
  providerType?: string;
  limit?: number;
}): Promise<NearbyProviderItem[]> {
  const radius = input.radiusM ?? 1500;
  const limit = input.limit ?? 50;
  const sb = getServiceSupabase();

  if (sb) {
    const box = bboxForRadius(input.lat, input.lng, radius);
    /* 예전엔 expert_profiles 를 좌표로 훑었는데, 그 테이블에는 lat/lng 도
       organization_name·office_phone·provider_type 도 없다. 없는 컬럼을 고르니
       모든 호출이 error 였고 — 아래 throw 덕에 거짓말은 안 했지만 — 주변 전문가
       기능은 100% 실패였다. 좌표를 실제로 가진 표는 map_related_experts 다. */
    const { data, error } = await sb
      .from("map_related_experts")
      .select(
        "id,name,category,expert_type,address,road_address,phone,latitude,longitude",
      )
      .eq("is_active", true)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .gte("latitude", box.minLat)
      .lte("latitude", box.maxLat)
      .gte("longitude", box.minLng)
      .lte("longitude", box.maxLng)
      .limit(200);

    /* 못 읽은 것을 [] 로 돌려주면 "이 근처에는 전문가가 없다"가 된다. 게다가 그
       응답은 s-maxage=120 으로 CDN 에 얹혀, 한 번의 조회 실패가 그 좌표의
       "주변 전문가 없음"을 2분 동안 굳힌다. 못 읽었으면 던진다. */
    if (error) {
      throw new Error(
        `map_related_experts 조회 실패 (주변 전문가): ${error.message ?? "알 수 없는 오류"}`,
      );
    }

    const items: NearbyProviderItem[] = [];
    for (const row of data ?? []) {
      const plat = Number(row.latitude);
      const plng = Number(row.longitude);
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
      const distance_m = Math.round(haversineDistanceM(input.lat, input.lng, plat, plng));
      if (distance_m > radius) continue;
      const provider_type =
        (row.expert_type as string | null) ?? mapCategoryToProviderType(String(row.category));
      if (input.providerType && provider_type !== input.providerType) continue;
      items.push({
        id: String(row.id),
        provider_type,
        display_name: String(row.name),
        /* 이 표에는 사무소명 컬럼이 없다. 이름을 사무소명으로 재활용하면
           "○○공인중개사사무소"가 아닌 것도 사무소처럼 보인다 — 비워 둔다. */
        office_name: null,
        address: row.road_address
          ? String(row.road_address)
          : row.address
            ? String(row.address)
            : null,
        phone: row.phone ? String(row.phone) : null,
        /* 공개자료 수집 결과라 검증 표시가 없다. 임의로 verified 를 붙이지 않는다. */
        verified_status: "pending",
        distance_m,
        /* `/experts/{id}` 는 이 앱에 없는 경로다(app/town/experts 에 [id] 없음).
           전문가 상세가 생기기 전까지는 목록으로 보낸다. */
        href: "/town/experts",
      });
    }
    items.sort((a, b) => a.distance_m - b.distance_m);
    return items.slice(0, limit);
  }

  return [];
}
