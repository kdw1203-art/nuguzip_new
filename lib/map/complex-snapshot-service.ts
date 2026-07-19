import { getServiceSupabase } from "@/lib/supabase/service";
import { getTransactionHistory } from "@/lib/complex/complex-store";

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
      : Promise.resolve({ data: [] }),
    sb
      ? sb
          .from("nearby_provider_links")
          .select(
            "link_type,distance_m,expert:expert_id(name,provider_type,organization_name,title,office_phone)",
          )
          .eq("complex_id", complexId)
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);

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
    provider_type?: string | null;
    organization_name?: string | null;
    title?: string | null;
    office_phone?: string | null;
  };

  const providers = (providersRes.data ?? []).map((row) => {
    const expert = row.expert as ExpertJoin | ExpertJoin[] | null;
    const e = Array.isArray(expert) ? expert[0] : expert;
    return {
      display_name: e?.name ? String(e.name) : "전문가",
      provider_type: e?.provider_type ? String(e.provider_type) : null,
      office_name: e?.organization_name
        ? String(e.organization_name)
        : e?.title
          ? String(e.title)
          : null,
      phone: e?.office_phone ? String(e.office_phone) : null,
      distance_m: row.distance_m != null ? Number(row.distance_m) : null,
      link_type: String(row.link_type),
    };
  });

  return { complexId, transactions, listings, providers };
}
