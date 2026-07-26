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

function mapCategoryToProviderType(category: string): string {
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
    const { data, error } = await sb
      .from("expert_profiles")
      .select(
        "id,name,title,category,organization_name,office_address,office_phone,provider_type,is_verified,lat,lng",
      )
      .not("lat", "is", null)
      .not("lng", "is", null)
      .gte("lat", box.minLat)
      .lte("lat", box.maxLat)
      .gte("lng", box.minLng)
      .lte("lng", box.maxLng)
      .limit(200);

    /* 못 읽은 것을 [] 로 돌려주면 "이 근처에는 전문가가 없다"가 된다. 게다가 그
       응답은 s-maxage=120 으로 CDN 에 얹혀, 한 번의 조회 실패가 그 좌표의
       "주변 전문가 없음"을 2분 동안 굳힌다. 못 읽었으면 던진다. */
    if (error) {
      throw new Error(
        `expert_profiles 조회 실패 (주변 전문가): ${error.message ?? "알 수 없는 오류"}`,
      );
    }

    const items: NearbyProviderItem[] = [];
    for (const row of data ?? []) {
      const plat = Number(row.lat);
      const plng = Number(row.lng);
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
      const distance_m = Math.round(haversineDistanceM(input.lat, input.lng, plat, plng));
      if (distance_m > radius) continue;
      const provider_type =
        (row.provider_type as string | null) ?? mapCategoryToProviderType(String(row.category));
      if (input.providerType && provider_type !== input.providerType) continue;
      items.push({
        id: String(row.id),
        provider_type,
        display_name: String(row.name),
        office_name: row.organization_name ? String(row.organization_name) : String(row.title),
        address: row.office_address ? String(row.office_address) : null,
        phone: row.office_phone ? String(row.office_phone) : null,
        verified_status: row.is_verified ? "verified" : "pending",
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
