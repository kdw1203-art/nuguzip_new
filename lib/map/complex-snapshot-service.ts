import { getServiceSupabase } from "@/lib/supabase/service";
import { getTransactionHistory } from "@/lib/complex/complex-store";
import { mapCategoryToProviderType } from "@/lib/map/nearby-providers-store";

export type ComplexSnapshotResponse = {
  complexId: string;
  transactions: Array<{
    complex_id: string;
    contract_ym: string;
    area_m2: number | null;
    avg_manwon: number | null;
    min_manwon: number | null;
    max_manwon: number | null;
    deal_count: number | null;
    trade_type: string;
    source: string | null;
  }>;
  listings: Array<{
    id: number;
    title: string;
    sale_type: string;
    deposit_krw: number | null;
    monthly_rent_krw: number | null;
    sale_price_krw: number | null;
    area_m2: number | null;
    status: string;
    last_seen_at: string;
    external_source: string;
  }>;
  providers: Array<{
    display_name: string;
    provider_type: string | null;
    office_name: string | null;
    phone: string | null;
    distance_m: number | null;
    link_type: string;
  }>;
};

/** 조회 실패 전용 — "이 단지엔 매물/전문가가 없다"와 절대 섞지 않는다. */
function snapshotQueryError(where: string, err: { message?: string }): Error {
  return new Error(`${where} 조회 실패: ${err.message ?? "알 수 없는 오류"}`);
}

export async function getComplexSnapshot(complexId: string): Promise<ComplexSnapshotResponse> {
  const sb = getServiceSupabase();

  const [txRows, listingsRes, providersRes] = await Promise.all([
    getTransactionHistory(complexId, 50),
    sb
      ? sb
          .from("partner_listings")
          .select(
            "id,title,sale_type,deposit_krw,monthly_rent_krw,sale_price_krw,area_m2,status,last_seen_at,external_source",
          )
          .eq("complex_id", complexId)
          .eq("status", "active")
          .order("last_seen_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
    sb
      ? sb
          /* expert_profiles 에는 provider_type·organization_name·office_phone 이
             없다. 예전 embed 는 그 셋을 골라 매번 error 를 냈고, 아래 `?? []` 가
             그 error 를 "주변 전문가 없음"으로 바꿔 답했다. 실재하는 컬럼만
             고르고, 업종은 category 로 유추한다. */
          .from("nearby_provider_links")
          .select("link_type,distance_m,expert:expert_id(name,category,title)")
          .eq("complex_id", complexId)
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (listingsRes.error) throw snapshotQueryError("partner_listings", listingsRes.error);
  if (providersRes.error) throw snapshotQueryError("nearby_provider_links", providersRes.error);

  const transactions = txRows.map((t) => ({
    complex_id: t.complex_id,
    contract_ym: t.yyyymm,
    area_m2: t.area_m2,
    avg_manwon: t.avg_manwon,
    min_manwon: t.min_manwon,
    max_manwon: t.max_manwon,
    deal_count: t.deal_count,
    trade_type: "sale",
    source: t.source,
  }));

  const listings = (listingsRes.data ?? []).map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    sale_type: String(row.sale_type),
    deposit_krw: row.deposit_krw != null ? Number(row.deposit_krw) : null,
    monthly_rent_krw: row.monthly_rent_krw != null ? Number(row.monthly_rent_krw) : null,
    sale_price_krw: row.sale_price_krw != null ? Number(row.sale_price_krw) : null,
    area_m2: row.area_m2 != null ? Number(row.area_m2) : null,
    status: String(row.status),
    last_seen_at: String(row.last_seen_at),
    external_source: String(row.external_source),
  }));

  type ExpertJoin = {
    name?: string;
    category?: string | null;
    title?: string | null;
  };

  /* expert_profiles 에 전화번호 컬럼이 없다 — 지어내지 않고 null 로 둔다. */
  const providers = (providersRes.data ?? []).map((row) => {
    const expert = row.expert as ExpertJoin | ExpertJoin[] | null;
    const e = Array.isArray(expert) ? expert[0] : expert;
    return {
      display_name: e?.name ? String(e.name) : "전문가",
      provider_type: e?.category ? mapCategoryToProviderType(String(e.category)) : null,
      office_name: e?.title ? String(e.title) : null,
      phone: null,
      distance_m: row.distance_m != null ? Number(row.distance_m) : null,
      link_type: String(row.link_type),
    };
  });

  return { complexId, transactions, listings, providers };
}
