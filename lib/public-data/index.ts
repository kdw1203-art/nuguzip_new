import { isSeoulApiConfigured } from "@/lib/seoul/openapi-client";
import {
  fetchFacilitiesAggregate,
  fetchRtmsRent,
  fetchRtmsSale,
  fetchUpisRebuild,
} from "@/lib/seoul/adapters";
import { fetchExCongestionFrequency } from "@/lib/ex/adapters/congestion-frequency";
import { fetchMolitAptTrade } from "@/lib/national-data/molit-api";
import { isDataGoKrEncodingConfigured } from "@/lib/public-data/data-go-kr-keys";
import { logger } from "@/lib/log";

/**
 * 공공데이터 통합 패처 (cache layer).
 *
 * - 환경변수 키가 있으면 서울 Open API 어댑터 호출
 * - 없으면 mock 데이터 반환
 * - Supabase `public_data_cache` 테이블에 TTL 캐시 (Supabase 미설정 시 in-memory)
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { publicDataCacheKey } from "./cache-key";
import type { DataSourceId, DataEnvelope, LocationRef } from "./types";

export type { DataSourceId, DataEnvelope, LocationRef } from "./types";
export { publicDataCacheKey } from "./cache-key";

export function isPublicDataLive(source: DataSourceId): boolean {
  if (source === "ex-congestion") return true;
  if (source === "mot-transactions") {
    return isDataGoKrEncodingConfigured() || isSeoulApiConfigured();
  }
  const meta = DATA_SOURCES[source];
  return Boolean(process.env[meta.envKey]?.trim());
}

// ── 데이터 소스 메타 ──────────────────────────────────────────────
const DATA_SOURCES: Record<DataSourceId, { envKey: string; label: string; ttlMs: number }> = {
  "mot-transactions": {
    envKey: "MOLIT_SERVICE_KEY",
    label: "국토부·서울 실거래가",
    ttlMs: 86_400_000,
  },
  "kosis-population": { envKey: "KOSIS_SERVICE_KEY", label: "통계청 인구통계", ttlMs: 3_600_000 },
  facilities: { envKey: "SEOUL_DATA_API_KEY", label: "서울 생활편의시설", ttlMs: 604_800_000 },
  schools: { envKey: "SCHOOLINFO_API_KEY", label: "학교알리미", ttlMs: 604_800_000 },
  redevelopment: { envKey: "SEOUL_DATA_API_KEY", label: "정비사업(upisRebuild)", ttlMs: 604_800_000 },
  "ex-congestion": {
    envKey: "EX_DATA_API_KEY",
    label: "한국도로공사 혼잡빈도",
    ttlMs: 720 * 3_600_000,
  },
};

// ── in-memory 캐시 폴백 ───────────────────────────────────────────
const memCache = new Map<string, { data: unknown; expiresAt: number }>();

const cacheKey = publicDataCacheKey;

export async function readPublicDataCache(key: string): Promise<unknown | null> {
  return readCache(key);
}

export async function writePublicDataCache(
  key: string,
  payload: unknown,
  ttlMs?: number,
): Promise<void> {
  return writeCache(key, payload, ttlMs);
}

async function readCache(key: string): Promise<unknown | null> {
  const mem = memCache.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.data;

  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("public_data_cache")
    .select("payload")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data?.payload ?? null;
}

async function writeCache(key: string, payload: unknown, ttlMs = 3_600_000): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  memCache.set(key, { data: payload, expiresAt: Date.now() + ttlMs });

  const sb = getServiceSupabase();
  if (!sb) return;
  try {
    await sb.from("public_data_cache").upsert({
      cache_key: key,
      source: key.split(":")[0],
      payload,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt,
    });
  } catch {
    // non-critical
  }
}

// ── Mock 데이터 ───────────────────────────────────────────────────
function mockMotTransactions(params: LocationRef) {
  const district = params.district ?? "강남구";
  const months: Array<{ yyyymm: string; avgPrice: number; count: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      yyyymm,
      avgPrice: Math.round((8_000_000 + Math.random() * 2_000_000) * (1 + i * 0.003)),
      count: Math.floor(50 + Math.random() * 100),
    });
  }
  return { district, city: params.city ?? "서울", months, mode: "mock" as const };
}

function mockKosisPopulation(params: LocationRef) {
  return {
    district: params.district ?? "강남구",
    totalPopulation: 500_000 + Math.floor(Math.random() * 200_000),
    households: 200_000 + Math.floor(Math.random() * 100_000),
    avgAge: 35 + Math.random() * 10,
    yoyGrowthPct: -0.5 + Math.random() * 1.5,
    mode: "mock" as const,
  };
}

function mockFacilities(params: LocationRef) {
  return {
    district: params.district ?? "강남구",
    schools: Math.floor(10 + Math.random() * 20),
    hospitals: Math.floor(5 + Math.random() * 20),
    subwayStations: Math.floor(3 + Math.random() * 8),
    parks: Math.floor(3 + Math.random() * 12),
    convenienceStores: Math.floor(30 + Math.random() * 60),
    pharmacies: Math.floor(8 + Math.random() * 15),
    childcare: Math.floor(5 + Math.random() * 12),
    mode: "mock" as const,
  };
}

function mockSchools(params: LocationRef) {
  return {
    district: params.district ?? "강남구",
    elementary: Math.floor(5 + Math.random() * 15),
    middle: Math.floor(3 + Math.random() * 10),
    high: Math.floor(3 + Math.random() * 10),
    specialPurpose: Math.floor(Math.random() * 5),
    avgScore: 70 + Math.random() * 20,
    mode: "mock" as const,
  };
}

function mockRedevelopment(params: LocationRef) {
  return {
    district: params.district ?? "강남구",
    activeProjects: Math.floor(Math.random() * 8),
    plannedProjects: Math.floor(Math.random() * 12),
    estimatedUnits: Math.floor(500 + Math.random() * 5000),
    nearestCompletionYear: 2026 + Math.floor(Math.random() * 5),
    projects: [],
    mode: "mock" as const,
  };
}

function mockExCongestion(params: LocationRef) {
  return {
    routeNo: null,
    zoneQuery: params.district ?? "",
    mode: "mock" as const,
  };
}

const MOCK_BUILDERS: Record<DataSourceId, (p: LocationRef) => unknown> = {
  "mot-transactions": mockMotTransactions,
  "kosis-population": mockKosisPopulation,
  facilities: mockFacilities,
  schools: mockSchools,
  redevelopment: mockRedevelopment,
  "ex-congestion": mockExCongestion,
};

// ── 실제 API 호출 ──────────────────────────────────────────────────
async function fetchFromApi(
  source: DataSourceId,
  params: LocationRef & Record<string, string>,
): Promise<unknown> {
  if (source === "ex-congestion") {
    const routeNo = params.routeNo ? Number.parseInt(params.routeNo, 10) : undefined;
    return fetchExCongestionFrequency({
      routeNo: Number.isFinite(routeNo) ? routeNo : undefined,
      yyyymm: params.yyyymm,
      zoneQuery: params.zone ?? params.district,
      limit: params.limit ? Number.parseInt(params.limit, 10) : 15,
    });
  }

  const meta = DATA_SOURCES[source];
  const apiKey =
    source === "mot-transactions"
      ? isDataGoKrEncodingConfigured() || process.env.SEOUL_DATA_API_KEY?.trim()
        ? "configured"
        : undefined
      : process.env[meta.envKey]?.trim();
  if (!apiKey) {
    return MOCK_BUILDERS[source](params);
  }

  if (
    source !== "mot-transactions" &&
    !isSeoulApiConfigured() &&
    meta.envKey === "SEOUL_DATA_API_KEY"
  ) {
    return MOCK_BUILDERS[source](params);
  }

  try {
    switch (source) {
      case "mot-transactions": {
        if (isDataGoKrEncodingConfigured()) {
          const molit = await fetchMolitAptTrade({ district: params.district });
          if (molit.mode === "live" && molit.rows.length > 0) {
            const rows = molit.rows.slice(0, 10).map((r) => ({
              buildingName: r.aptNm,
              district: r.umdNm,
              priceManwon: Number.parseInt(String(r.dealAmount ?? "").replace(/,/g, ""), 10) || 0,
              archArea: Number.parseFloat(String(r.excluUseAr ?? "0")) || 0,
              floor: Number.parseInt(String(r.floor ?? "0"), 10) || 0,
              contractDay: `${r.dealYear}${String(r.dealMonth).padStart(2, "0")}${String(r.dealDay).padStart(2, "0")}`,
            }));
            const prices = rows
              .filter((r) => r.archArea > 0)
              .map((r) => (r.priceManwon * 10_000) / r.archArea);
            const avgPricePerM2 =
              prices.length > 0
                ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
                : 0;
            return {
              district: params.district,
              city: params.city,
              months: [],
              avgPricePerM2,
              tradeCount30d: molit.rows.length,
              recentRows: rows,
              sourceService: "RTMSDataSvcAptTrade",
              mode: "live" as const,
            };
          }
        }
        if (isSeoulApiConfigured()) {
          const sale = await fetchRtmsSale({
            city: params.city,
            district: params.district,
          });
          return {
            district: sale.district,
            city: sale.city,
            months: sale.months,
            avgPricePerM2: sale.avgPricePerM2,
            tradeCount30d: sale.tradeCount30d,
            recentRows: sale.rows.slice(0, 10),
            sourceService: sale.sourceService,
            mode: "live" as const,
          };
        }
        return MOCK_BUILDERS[source](params);
      }
      case "facilities": {
        const f = await fetchFacilitiesAggregate({
          city: params.city,
          district: params.district,
        });
        return {
          district: f.district,
          schools: f.counts.schools,
          hospitals: f.counts.hospitals,
          subwayStations: f.counts.subwayStations,
          parks: f.counts.parks,
          convenienceStores: f.counts.convenienceStores,
          pharmacies: f.counts.pharmacies,
          childcare: f.counts.childcare,
          busStops: f.counts.busStops,
          parkingLots: f.counts.parkingLots,
          libraries: f.counts.libraries,
          nearest: f.nearest,
          mode: "live" as const,
        };
      }
      case "redevelopment": {
        const r = await fetchUpisRebuild({
          city: params.city,
          district: params.district,
        });
        return {
          district: r.district,
          activeProjects: r.activeProjects,
          plannedProjects: r.plannedProjects,
          estimatedUnits: r.estimatedUnits,
          nearestCompletionYear: r.nearestCompletionYear,
          projects: r.projects,
          mode: "live" as const,
        };
      }
      case "kosis-population":
      case "schools":
        logger.info(`[public-data] ${source} — key set; national API adapter pending`);
        return MOCK_BUILDERS[source](params);
    }
  } catch (err) {
    logger.warn(`[public-data] ${source} live fetch failed, falling back to mock`, err);
    return MOCK_BUILDERS[source](params);
  }
}

// ── 공개 API ─────────────────────────────────────────────────────
export async function fetchPublicData<T = unknown>(
  source: DataSourceId,
  params: LocationRef & Record<string, string>,
  ttlMs?: number,
): Promise<DataEnvelope<T>> {
  const meta = DATA_SOURCES[source];
  const effectiveTtl = ttlMs ?? meta.ttlMs;
  const key = cacheKey(source, params);
  const cached = await readCache(key);
  if (cached) {
    return {
      source,
      fromCache: true,
      fetchedAt: new Date().toISOString(),
      data: cached as T,
    };
  }

  const data = await fetchFromApi(source, params);
  await writeCache(key, data, effectiveTtl);
  return {
    source,
    fromCache: false,
    fetchedAt: new Date().toISOString(),
    data: data as T,
  };
}

/** 전월세 단독 fetch (캐시 없음) */
export async function fetchRtmsRentPublic(params: LocationRef) {
  if (!isSeoulApiConfigured()) return null;
  return fetchRtmsRent({ city: params.city, district: params.district });
}

export type { NormalizedTransactionMonth, PublicDataAdapter, RealTransactionRow } from "./adapter";
export type { MotTransactionsMockPayload, PublicDataRawSnapshot } from "./pipeline";
export {
  fetchRawPublicDataSnapshot,
  normalizeMotMockToRealTransactionRows,
  snapshotFromEnvelopeAndNormalized,
} from "./pipeline";
