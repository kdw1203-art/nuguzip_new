import type { NormalizedTransactionMonth, RealTransactionRow } from "./adapter";
import { publicDataCacheKey } from "./cache-key";
import type { DataSourceId, DataEnvelope, LocationRef } from "./types";

/**
 * ETL/테스트용 — 캐시/파서와 동일 키로 `fetchPublicData` 결과의 raw 페이로드만 보관
 * (dynamic import로 `index` 와의 순환 의존을 피함)
 */
export type PublicDataRawSnapshot<T = unknown> = {
  source: DataSourceId;
  key: string;
  fromCache: boolean;
  fetchedAt: string;
  raw: T;
};

export async function fetchRawPublicDataSnapshot<T = unknown>(
  source: DataSourceId,
  params: LocationRef & Record<string, string>,
  ttlMs = 3_600_000,
): Promise<PublicDataRawSnapshot<T>> {
  const { fetchPublicData } = await import("./index");
  const key = publicDataCacheKey(source, params);
  const env = await fetchPublicData<T>(source, params, ttlMs);
  return {
    source,
    key,
    fromCache: env.fromCache,
    fetchedAt: env.fetchedAt,
    raw: env.data,
  };
}

/** `index` mock `mot-transactions` 페이로드 shape (실 API 연동 시 파서로 치환) */
export type MotTransactionsMockPayload = {
  district: string;
  city: string;
  months: Array<{ yyyymm: string; avgPrice: number; count: number }>;
};

/**
 * mock 월 집계 → `RealTransactionRow` (월당 대표 1행; 상세 trade 리스트는 별도 소스)
 */
export function normalizeMotMockToRealTransactionRows(
  data: unknown,
  base: LocationRef,
): { months: NormalizedTransactionMonth[]; rows: RealTransactionRow[] } {
  const o = (data && typeof data === "object" ? (data as MotTransactionsMockPayload) : null) ?? {
    district: base.district ?? "강남구",
    city: base.city ?? "서울",
    months: [],
  };
  const city = o.city || base.city;
  const district = o.district || base.district;
  const months: NormalizedTransactionMonth[] = (o.months ?? []).map((m) => ({
    yyyymm: m.yyyymm,
    avgPrice: m.avgPrice,
    count: m.count,
  }));
  const rows: RealTransactionRow[] = months.map((m) => ({
    yyyymm: m.yyyymm,
    city,
    district,
    priceWon: m.avgPrice,
    dealCount: m.count,
  }));
  return { months, rows };
}

/** 테스트/스냅샷 고정: `DataEnvelope` + 정규화 행 */
export function snapshotFromEnvelopeAndNormalized<T>(
  env: DataEnvelope<T>,
  normalized: { months: NormalizedTransactionMonth[]; rows: RealTransactionRow[] },
  source: DataSourceId,
  params: LocationRef & Record<string, string>,
) {
  return {
    key: publicDataCacheKey(source, params),
    source,
    envelope: {
      fromCache: env.fromCache,
      fetchedAt: env.fetchedAt,
    },
    normalized,
  };
}
