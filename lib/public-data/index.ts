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

/**
 * 이 소스가 **지금 실데이터를 내놓을 수 있는지**.
 *
 * 2026-07-28 이전에는 두 가지가 틀려 있었다.
 *  - `ex-congestion` 은 무조건 true 였다. 실제로는 EX_DATA_API_KEY 와 무관하게
 *    번들된 샘플 행을 돌려주고 있어서, "라이브"라고 답할 근거가 없었다.
 *  - 어댑터가 아직 없는 소스(kosis-population · schools)도 키만 있으면 true 였다.
 *    키를 넣으면 상태 배지가 "연동됨"으로 바뀌는데 값은 전부 null 로 나온다 —
 *    소유자가 키를 제대로 넣고도 "왜 데이터가 없지" 하고 헤매게 되는 자리다.
 *
 * 키의 존재가 아니라 **호출할 어댑터가 있는지**까지 봐야 한다.
 */
export function isPublicDataLive(source: DataSourceId): boolean {
  if (!ADAPTER_READY[source]) return false;
  if (source === "mot-transactions") {
    return isDataGoKrEncodingConfigured() || isSeoulApiConfigured();
  }
  const meta = DATA_SOURCES[source];
  return Boolean(process.env[meta.envKey]?.trim());
}

/**
 * 이 소스를 실제로 호출하는 어댑터가 저장소에 구현돼 있는가.
 *
 * false 면 키를 아무리 넣어도 값은 비어 있다. 그 사실을 상태 배지가 그대로
 * 말하게 하려고 따로 둔다 — 키 유무와 어댑터 유무는 다른 이야기다.
 */
const ADAPTER_READY: Record<DataSourceId, boolean> = {
  "mot-transactions": true,
  facilities: true,
  redevelopment: true,
  /* 샘플 행을 돌려준다. 실 API 연동 전까지는 라이브가 아니다. */
  "ex-congestion": false,
  /* fetchFromApi 가 "adapter pending" 을 찍고 빈 값을 돌려주는 두 소스. */
  "kosis-population": false,
  schools: false,
};

// ── 데이터 소스 메타 ──────────────────────────────────────────────
/* envKey 는 **실제로 코드가 읽는 변수 이름과 같아야 한다.** 여기 이름이 어긋나면
   소유자가 Vercel 에 키를 넣어도 상태 배지는 영원히 "미연동"이고, 반대로 아무
   코드도 읽지 않는 이름이 "연동됨"으로 켜지기도 한다. 둘 다 거짓말이다.
   scripts/check-env-key-names.mjs 가 이 표를 실제 process.env 참조와 대조한다. */
const DATA_SOURCES: Record<DataSourceId, { envKey: string; label: string; ttlMs: number }> = {
  "mot-transactions": {
    envKey: "MOLIT_SERVICE_KEY",
    label: "국토부·서울 실거래가",
    ttlMs: 86_400_000,
  },
  /* lib/kosis/client.ts 가 읽는 이름은 KOSIS_API_KEY 다. 예전엔 여기만
     KOSIS_SERVICE_KEY 로 적혀 있어서 아무도 읽지 않는 변수를 가리키고 있었다. */
  "kosis-population": { envKey: "KOSIS_API_KEY", label: "통계청 인구통계", ttlMs: 3_600_000 },
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

// ── 미연동(unavailable) 응답 ──────────────────────────────────────
/* 사실 우선: 여기 있던 MOCK_BUILDERS 6종은 전부 `Math.random()` 으로 숫자를
   지어냈다. 실제 구(區) 이름을 달고 인구 50~70만, 학교 10~30개, 병원 5~25개,
   정비사업 0~8건, 학군 평균점수 70~90점 같은 값을 만들어 냈고 — 난수라서
   같은 지역을 두 번 조회하면 값이 달라졌다. district 기본값도 "강남구" 라,
   지역을 지정하지 않으면 강남구의 통계인 것처럼 보였다.
   이제 모양(스키마)만 유지하고 값은 비운다: 모르는 것은 null 이다.
   `mode: "mock"` 은 그대로 두어 호출측이 "실데이터 아님"을 판별할 수 있게 한다. */
function unavailable<T extends Record<string, unknown>>(params: LocationRef, extra: T) {
  return {
    district: params.district ?? null,
    city: params.city ?? null,
    mode: "mock" as const,
    ...extra,
  };
}

/**
 * 실데이터가 없는 **이유**. `mode: "mock"` 하나로는 세 상태가 구분되지 않았다.
 *
 * 키가 없어서 못 부른 것과, 불렀는데 상대 서버가 죽어서 실패한 것은 사용자에게
 * 해 줄 말이 다르다. 앞은 "아직 연동 전", 뒤는 "지금 불러오지 못했어요 · 잠시
 * 후 다시" 다. 이걸 뭉개면 장애가 "데이터 없음"으로 둔갑한다 — 이 저장소가
 * lib/inspection/note-grounding.ts 에서 이미 ok/none/unknown/failed 로 지키고
 * 있는 규칙인데 여기만 빠져 있었다.
 *
 * `mode: "mock"` 은 기존 호출측(app/api/map/regions 등)이 그대로 쓰도록 유지한다.
 */
export type PublicDataUnavailableReason =
  /** 환경변수 키가 없다 — 소유자가 넣으면 해결된다 */
  | "not-configured"
  /** 키는 있는데 호출할 어댑터가 아직 구현되지 않았다 */
  | "adapter-pending"
  /** 불렀는데 실패했다(네트워크·5xx·파싱). 일시적일 수 있다 */
  | "fetch-failed";

function withReason(payload: unknown, reason: PublicDataUnavailableReason): unknown {
  if (!payload || typeof payload !== "object") return payload;
  return { ...(payload as Record<string, unknown>), unavailableReason: reason };
}

const MOCK_BUILDERS: Record<DataSourceId, (p: LocationRef) => unknown> = {
  "mot-transactions": (p) => unavailable(p, { months: [] }),
  "kosis-population": (p) =>
    unavailable(p, {
      totalPopulation: null,
      households: null,
      avgAge: null,
      yoyGrowthPct: null,
    }),
  facilities: (p) =>
    unavailable(p, {
      schools: null,
      hospitals: null,
      subwayStations: null,
      parks: null,
      convenienceStores: null,
      pharmacies: null,
      childcare: null,
    }),
  schools: (p) =>
    unavailable(p, {
      elementary: null,
      middle: null,
      high: null,
      specialPurpose: null,
      avgScore: null,
    }),
  redevelopment: (p) =>
    unavailable(p, {
      activeProjects: null,
      plannedProjects: null,
      estimatedUnits: null,
      nearestCompletionYear: null,
      projects: [],
    }),
  "ex-congestion": (p) => unavailable(p, { routeNo: null, zoneQuery: p.district ?? "" }),
};

// ── 실제 API 호출 ──────────────────────────────────────────────────
/**
 * `cacheable: false` 는 **캐시에 넣지 말라**는 뜻이다.
 *
 * 예전에는 결과를 무조건 writeCache 했다. facilities·schools·redevelopment 의
 * TTL 이 7일이라, 상대 서버가 30초 잠깐 흔들린 것만으로 "이 지역은 데이터가
 * 없다"가 일주일 동안 굳어 fromCache: true 로 재공급됐다. 실패는 캐시하지
 * 않는다 — 다음 요청이 다시 시도할 수 있어야 한다.
 */
type FetchOutcome = { payload: unknown; cacheable: boolean };

async function fetchFromApi(
  source: DataSourceId,
  params: LocationRef & Record<string, string>,
): Promise<FetchOutcome> {
  if (source === "ex-congestion") {
    const routeNo = params.routeNo ? Number.parseInt(params.routeNo, 10) : undefined;
    const payload = await fetchExCongestionFrequency({
      routeNo: Number.isFinite(routeNo) ? routeNo : undefined,
      yyyymm: params.yyyymm,
      zoneQuery: params.zone ?? params.district,
      limit: params.limit ? Number.parseInt(params.limit, 10) : 15,
    });
    return { payload, cacheable: true };
  }

  const meta = DATA_SOURCES[source];
  const apiKey =
    source === "mot-transactions"
      ? isDataGoKrEncodingConfigured() || process.env.SEOUL_DATA_API_KEY?.trim()
        ? "configured"
        : undefined
      : process.env[meta.envKey]?.trim();
  if (!apiKey) {
    /* 키가 없는 건 지금 당장 바뀔 일이 아니다 — 캐시해도 거짓이 되지 않는다. */
    return {
      payload: withReason(MOCK_BUILDERS[source](params), "not-configured"),
      cacheable: true,
    };
  }

  if (
    source !== "mot-transactions" &&
    !isSeoulApiConfigured() &&
    meta.envKey === "SEOUL_DATA_API_KEY"
  ) {
    return {
      payload: withReason(MOCK_BUILDERS[source](params), "not-configured"),
      cacheable: true,
    };
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
            const payload = {
              district: params.district,
              city: params.city,
              months: [],
              avgPricePerM2,
              tradeCount30d: molit.rows.length,
              recentRows: rows,
              sourceService: "RTMSDataSvcAptTrade",
              mode: "live" as const,
            };
            return { payload, cacheable: true };
          }
        }
        if (isSeoulApiConfigured()) {
          const sale = await fetchRtmsSale({
            city: params.city,
            district: params.district,
          });
          const payload = {
            district: sale.district,
            city: sale.city,
            months: sale.months,
            avgPricePerM2: sale.avgPricePerM2,
            tradeCount30d: sale.tradeCount30d,
            recentRows: sale.rows.slice(0, 10),
            sourceService: sale.sourceService,
            mode: "live" as const,
          };
          return { payload, cacheable: true };
        }
        return {
          payload: withReason(MOCK_BUILDERS[source](params), "not-configured"),
          cacheable: true,
        };
      }
      case "facilities": {
        const f = await fetchFacilitiesAggregate({
          city: params.city,
          district: params.district,
        });
        const payload = {
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
        return { payload, cacheable: true };
      }
      case "redevelopment": {
        const r = await fetchUpisRebuild({
          city: params.city,
          district: params.district,
        });
        const payload = {
          district: r.district,
          activeProjects: r.activeProjects,
          plannedProjects: r.plannedProjects,
          estimatedUnits: r.estimatedUnits,
          nearestCompletionYear: r.nearestCompletionYear,
          projects: r.projects,
          mode: "live" as const,
        };
        return { payload, cacheable: true };
      }
      case "kosis-population":
      case "schools":
        logger.info(`[public-data] ${source} — key set; national API adapter pending`);
        return {
          payload: withReason(MOCK_BUILDERS[source](params), "adapter-pending"),
          cacheable: true,
        };
    }
  } catch (err) {
    /* 여기까지 왔다는 건 **키는 있는데 호출이 실패했다**는 뜻이다. 캐시하지
       않는다 — 7일 TTL 에 실패를 굳혀 두면 장애가 "데이터 없음"이 된다. */
    logger.warn(`[public-data] ${source} live fetch failed (not cached)`, err);
    return {
      payload: withReason(MOCK_BUILDERS[source](params), "fetch-failed"),
      cacheable: false,
    };
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

  const { payload, cacheable } = await fetchFromApi(source, params);
  /* 실패는 캐시하지 않는다. 다음 요청이 다시 시도할 수 있어야 한다. */
  if (cacheable) await writeCache(key, payload, effectiveTtl);
  return {
    source,
    fromCache: false,
    fetchedAt: new Date().toISOString(),
    data: payload as T,
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
