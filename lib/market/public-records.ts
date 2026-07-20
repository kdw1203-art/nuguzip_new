import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { CODEF_PRODUCTS } from "@/lib/codef/endpoints";
import { logger } from "@/lib/log";

/**
 * public_property_records(공공·공개 부동산 자료 캐시) 읽기 전용 로더.
 * CODEF 등으로 적재된 KB 시세·공시가격·신고이력 등을 단지/데이터셋 단위로 조회.
 * 데이터가 없으면 빈 결과 → 화면은 정직한 빈 상태를 렌더한다.
 */

export type PublicRecord = {
  id: number;
  dataset: string;
  complexName: string | null;
  regionName: string | null;
  address: string | null;
  recordDate: string | null;
  period: string | null;
  areaM2: number | null;
  priceLowKrw: number | null;
  priceHighKrw: number | null;
  depositKrw: number | null;
  monthlyRentKrw: number | null;
  floor: string | null;
  metadata: Record<string, unknown>;
};

const DATASET_LABEL = new Map(
  CODEF_PRODUCTS.map((p) => [p.dataset, p.label] as const),
);

export function datasetLabel(dataset: string): string {
  return DATASET_LABEL.get(dataset) ?? dataset;
}

function mapRow(r: Record<string, unknown>): PublicRecord {
  return {
    id: Number(r.id),
    dataset: String(r.dataset),
    complexName: r.complex_name ? String(r.complex_name) : null,
    regionName: r.region_name ? String(r.region_name) : null,
    address: r.address ? String(r.address) : null,
    recordDate: r.record_date ? String(r.record_date) : null,
    period: r.period ? String(r.period) : null,
    areaM2: r.area_m2 != null ? Number(r.area_m2) : null,
    priceLowKrw: r.price_low_krw != null ? Number(r.price_low_krw) : null,
    priceHighKrw: r.price_high_krw != null ? Number(r.price_high_krw) : null,
    depositKrw: r.deposit_krw != null ? Number(r.deposit_krw) : null,
    monthlyRentKrw: r.monthly_rent_krw != null ? Number(r.monthly_rent_krw) : null,
    floor: r.floor ? String(r.floor) : null,
    metadata:
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {},
  };
}

/** 단지명으로 공개 자료 조회 (모든 데이터셋). 실패·빈 데이터 시 [] */
export async function getPublicRecordsForComplex(
  complexName: string,
  limit = 60,
): Promise<PublicRecord[]> {
  const name = complexName.trim();
  if (!name) return [];
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("public_property_records")
      .select("*")
      .ilike("complex_name", `%${name}%`)
      .order("record_date", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => mapRow(r as Record<string, unknown>));
  } catch (e) {
    logger.error("[getPublicRecordsForComplex]", e);
    return [];
  }
}

/** 데이터셋별 적재 현황(건수·대상 단지 수·최신 기준일) — /data/records 요약 */
export async function getPublicRecordDatasetStats(): Promise<
  { dataset: string; label: string; rows: number; complexes: number; latest: string | null }[]
> {
  const sb = getReadOnlySupabase();
  const base = CODEF_PRODUCTS.map((p) => ({
    dataset: p.dataset,
    label: p.label,
    rows: 0,
    complexes: 0,
    latest: null as string | null,
  }));
  if (!sb) return base;
  try {
    const { data, error } = await sb
      .from("public_property_records")
      .select("dataset, complex_name, record_date")
      .limit(20000);
    if (error || !Array.isArray(data)) return base;
    const byDataset = new Map<
      string,
      { rows: number; complexes: Set<string>; latest: string | null }
    >();
    for (const row of data as Record<string, unknown>[]) {
      const ds = String(row.dataset);
      const entry =
        byDataset.get(ds) ?? { rows: 0, complexes: new Set<string>(), latest: null };
      entry.rows += 1;
      if (row.complex_name) entry.complexes.add(String(row.complex_name));
      const d = row.record_date ? String(row.record_date) : null;
      if (d && (!entry.latest || d > entry.latest)) entry.latest = d;
      byDataset.set(ds, entry);
    }
    return base.map((b) => {
      const e = byDataset.get(b.dataset);
      return e
        ? { ...b, rows: e.rows, complexes: e.complexes.size, latest: e.latest }
        : b;
    });
  } catch (e) {
    logger.error("[getPublicRecordDatasetStats]", e);
    return base;
  }
}
