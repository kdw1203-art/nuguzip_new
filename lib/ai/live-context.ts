import "server-only";
import { getRegionRentYieldRows } from "@/lib/market/rent-yield";

import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { decodeComplexId } from "@/lib/complex/complex-store";
import { resolveComplexPrice } from "@/lib/market/complex-price";
import { getRegionSnapshot, getRegionDemographics } from "@/lib/market/store";
import { getSupplyForArea } from "@/lib/market/supply";
import { regionIdForName } from "@/lib/region/catalog";
import { inspectionAverageScore, type InspectionScores } from "@/lib/inspection/store-db";
import { logger } from "@/lib/log";

/* [AI-09~17] 라이브 도구 컨텍스트 — AI 워크벤치의 실데이터 백본.
 *
 * 원칙:
 * - 축마다 출처(source)·기준 시점(asOf)·표본 수(sample)를 함께 나른다.
 *   이것이 그대로 근거 각주(AI-01)·신선도 배지(AI-17)·불확실성 판정(AI-03)의
 *   입력이 된다. 값만 나르는 축은 만들지 않는다.
 * - 축 하나의 조회 실패가 전체를 죽이지 않는다(allSettled). 실패한 축은
 *   null — "없음"과 "못 읽음"은 UI 캡션에서 구분한다.
 * - 여기서 계산하지 않는다. 판정(플래그·레이더·신호)은 insight-blocks 가
 *   이 컨텍스트를 입력으로 받아 순수 함수로 한다(골든셋 테스트 대상).
 */

export interface AxisMeta {
  /** 사람이 읽는 출처 라벨 — 예: "국토교통부 실거래(신고)" */
  source: string;
  /** 기준 시점 (ISO 날짜 또는 yyyymm) — 신선도 배지 재료 */
  asOf: string | null;
  /** 표본 수 — 불확실성 판정 재료 (없으면 null) */
  sample?: number | null;
  /** 원본을 볼 수 있는 내부 링크 */
  href?: string | null;
}

export interface LiveToolContext {
  generatedAt: string;
  complex: {
    id: string;
    name: string;
    region: string;
    price:
      | ({ priceKrw: number; bandLabel: string; latestYm: string } & AxisMeta)
      | null;
  } | null;
  region: {
    id: string | null;
    name: string;
    snapshot:
      | ({
          avgSale: number | null;
          jeonseRatio: number | null;
          saleChangeMonthly: number | null;
          tradeCount: number | null;
          period: string;
        } & AxisMeta)
      | null;
    demographics:
      | ({
          population: number | null;
          households: number | null;
          unsoldUnits: number | null;
          period: string;
        } & AxisMeta)
      | null;
  } | null;
  rent:
    | ({
        wolseSharePct: number | null;
        jeonseCount: number;
        wolseCount: number;
        medianMonthlyKrw: number | null;
        months: number;
      } & AxisMeta)
    | null;
  supply:
    | ({
        upcomingHouseholds: number;
        upcomingComplexes: number;
        items: { aptName: string | null; moveInYm: string; households: number | null }[];
      } & AxisMeta)
    | null;
  news:
    | ({ items: { id: string; title: string; at: string }[] } & AxisMeta)
    | null;
  notes:
    | ({
        count: number;
        avgScore: number | null;
        latest: { id: string; title: string } | null;
      } & AxisMeta)
    | null;
  macro:
    | ({ baseRatePct: number | null } & AxisMeta)
    | null;
  /* [AI-18] 학군 축 — 오너 키(⑧) 등록 후 poi_schools 적재 시 자동 합류.
     0행이면 null(축을 그리지 않는다) — 결합부만 미리 깔아 둔다. */
  poi: ({ schoolCount: number } & AxisMeta) | null;
}

const NUM = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

async function loadRent(regionName: string): Promise<LiveToolContext["rent"]> {
  /* 예전엔 여기서 직접 RPC 를 불렀다 — 워크벤치를 열 때마다 758,872행짜리
     전월세 집계를 **전 지역** 돌린 뒤 그중 한 지역만 골라 썼다(평균 5.5초).
     같은 값을 쓰는 세 화면이 공유 캐시 한 벌을 보게 바꿨다. */
  let data: Array<Record<string, unknown>>;
  try {
    data = await getRegionRentYieldRows();
  } catch {
    return null;
  }
  const row = data.find(
    (r) => String(r.region_name ?? "").trim() === regionName,
  );
  if (!row) return null;
  const jeonse = NUM(row.jeonse_count) ?? 0;
  const wolse = NUM(row.wolse_count) ?? 0;
  const total = jeonse + wolse;
  return {
    jeonseCount: jeonse,
    wolseCount: wolse,
    wolseSharePct: total > 0 ? Math.round((wolse / total) * 100) : null,
    medianMonthlyKrw: NUM(row.wolse_median_monthly_krw),
    months: 3,
    source: "국토교통부 전월세 신고(최근 3개월)",
    asOf: new Date().toISOString().slice(0, 10),
    sample: total,
    href: "/map?layer=rent-share",
  };
}

async function loadNews(
  regionName: string,
  complexName: string | null,
  opts: { fallbackToRegion?: boolean } = {},
): Promise<LiveToolContext["news"]> {
  const fallbackToRegion = opts.fallbackToRegion ?? true;
  const sb = getServiceSupabase();
  if (!sb) return null;
  /* 단지명 우선, 없으면 지역명 — 제목·요약 매칭(자동수집 글만) */
  const needle = (complexName ?? regionName).replace(/%/g, "");
  const { data, error } = await sb
    .from("board_posts")
    .select("id,title,created_at")
    .eq("is_automated", true)
    .or(`title.ilike.%${needle}%,ai_summary.ilike.%${needle}%`)
    .order("created_at", { ascending: false })
    .limit(3);
  if (error || !Array.isArray(data) || data.length === 0) {
    // 단지 매칭 실패 → 지역으로 폴백 (948: 단지 캐시 채우기에서는 끈다)
    if (complexName && fallbackToRegion) return loadNews(regionName, null);
    return null;
  }
  return {
    items: (data as Array<{ id: string; title: string; created_at: string }>).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      at: String(r.created_at),
    })),
    source: "내집나우 자동수집 뉴스(우리 요약)",
    asOf: String((data[0] as { created_at?: string }).created_at ?? "").slice(0, 10) || null,
    sample: data.length,
    href: "/town/news",
  };
}

async function loadNotes(
  regionName: string,
  complexName: string | null,
  opts: { fallbackToRegion?: boolean } = {},
): Promise<LiveToolContext["notes"]> {
  const fallbackToRegion = opts.fallbackToRegion ?? true;
  const sb = getServiceSupabase();
  if (!sb) return null;
  let q = sb
    .from("inspection_notes")
    .select("id,title,scores,created_at")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(20);
  q = complexName ? q.eq("apt_name", complexName) : q.eq("region", regionName);
  const { data, error } = await q;
  if (error || !Array.isArray(data)) return null;
  if (data.length === 0) {
    if (complexName && fallbackToRegion) return loadNotes(regionName, null);
    return null;
  }
  const scores = (data as Array<{ scores: InspectionScores | null }>)
    .map((r) => (r.scores ? inspectionAverageScore(r.scores) : 0))
    .filter((s) => s > 0);
  const first = data[0] as { id: string; title: string; created_at: string };
  return {
    count: data.length,
    avgScore: scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null,
    latest: { id: String(first.id), title: String(first.title) },
    source: complexName ? "이웃 공개 임장노트(이 단지)" : "이웃 공개 임장노트(이 지역)",
    asOf: String(first.created_at).slice(0, 10),
    sample: scores.length,
    href: "/notes",
  };
}

async function loadMacro(): Promise<LiveToolContext["macro"]> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("public_data_cache")
    .select("payload,fetched_at")
    .eq("cache_key", "ecos:base-rate")
    .maybeSingle();
  if (error || !data) return null;
  const payload = (data as { payload?: { value?: string } }).payload;
  const rate = NUM(payload?.value ?? null);
  if (rate === null) return null;
  return {
    baseRatePct: rate,
    source: "한국은행 ECOS 기준금리",
    asOf: String((data as { fetched_at?: string }).fetched_at ?? "").slice(0, 10) || null,
    sample: null,
    href: "/analysis/ai/ai-economy",
  };
}

async function loadPoi(regionName: string): Promise<LiveToolContext["poi"]> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { count, error } = await sb
    .from("poi_schools")
    .select("*", { count: "exact", head: true })
    .ilike("address", `%${regionName}%`);
  if (error || typeof count !== "number" || count === 0) return null;
  return {
    schoolCount: count,
    source: "전국 학교 표준데이터",
    asOf: null,
    sample: count,
    href: "/map",
  };
}

/* ── [948 · 최적화 2차] 축을 "지역 단위"와 "단지 단위"로 갈라서 캐시한다 ──────
   실측(2026-09-02, pg_stat_statements 11.5시간 델타): 단지 허브 렌더 약 3,000회에
   apartment_supply ILIKE 6,035회·board_posts ILIKE 4,408회·region_rent_yield_summary
   RPC 2,959회·apartment_complexes 2,995회 — 즉 **단지마다 9개 축을 전부 다시 읽었다**.
   원인은 둘이다.
   (1) 캐시 키가 단지 id 라 크롤러가 훑는 롱테일(2.6만 단지)에서는 사실상 항상 미스.
   (2) 캐시 채우기 안에서 부른 안쪽 unstable_cache(rent-yield)가 저장되지 않아
       "전역 1벌" 이어야 할 RPC 가 렌더마다 돌았다(13회 렌더 → 13회 호출로 확인).
   그래서 지역 축(시세 스냅샷·인구·전월세·입주·지역 뉴스·거시·학교)은 **지역명
   키**(전국 218개)로 따로 캐시하고, 단지 축(대표가·단지 뉴스·단지 노트)만 단지 키로
   캐시한다. 두 캐시 모두 최상위에서 부른다(중첩 금지 — 위 (2) 의 이유).
   조립 결과(LiveToolContext) 모양은 그대로다 — 부르는 쪽은 바뀌지 않는다. */

type RegionAxes = {
  snapshot: Awaited<ReturnType<typeof getRegionSnapshot>>;
  demographics: Awaited<ReturnType<typeof getRegionDemographics>>;
  rent: LiveToolContext["rent"];
  supply: Awaited<ReturnType<typeof getSupplyForArea>>;
  news: LiveToolContext["news"];
  notes: LiveToolContext["notes"];
  macro: LiveToolContext["macro"];
  poi: LiveToolContext["poi"];
};

type ComplexAxes = {
  price: Awaited<ReturnType<typeof resolveComplexPrice>> | null;
  news: LiveToolContext["news"];
  notes: LiveToolContext["notes"];
};

const settledVal = <T,>(r: PromiseSettledResult<T>, label: string): T | null => {
  if (r.status === "fulfilled") return r.value;
  logger.warn(`[live-context] ${label} 축 조회 실패`, r.reason);
  return null;
};

async function loadRegionAxes(regionName: string): Promise<RegionAxes> {
  const regionId = regionName ? regionIdForName(regionName) : null;
  const [snapR, demoR, rentR, supplyR, newsR, notesR, macroR, poiR] =
    await Promise.allSettled([
      regionId ? getRegionSnapshot(regionId) : Promise.resolve(null),
      regionId ? getRegionDemographics(regionId) : Promise.resolve(null),
      regionName ? loadRent(regionName) : Promise.resolve(null),
      regionName ? getSupplyForArea(regionName, 24) : Promise.resolve([]),
      regionName ? loadNews(regionName, null) : Promise.resolve(null),
      regionName ? loadNotes(regionName, null) : Promise.resolve(null),
      loadMacro(),
      regionName ? loadPoi(regionName) : Promise.resolve(null),
    ]);
  const axes: RegionAxes = {
    snapshot: settledVal(snapR, "지역 시세"),
    demographics: settledVal(demoR, "인구·미분양"),
    rent: settledVal(rentR, "전월세"),
    supply: settledVal(supplyR, "입주 물량") ?? [],
    news: settledVal(newsR, "지역 뉴스"),
    notes: settledVal(notesR, "지역 노트"),
    macro: settledVal(macroR, "거시"),
    poi: settledVal(poiR, "학교"),
  };
  /* 축이 **하나도** 없으면 던진다 — 로더들은 실패를 null 로 삼키므로, 전부 null 은
     "이 지역엔 정말 아무 것도 없다"가 아니라 DB 가 잡혀 있던 순간일 가능성이
     높다(거시 축은 지역과 무관하게 항상 있다). 던지면 데이터 캐시에 빈 지역이
     6시간 동안 굳지 않는다 — 부르는 쪽(ComplexAxisSummary 등)은 catch 로 접는다. */
  const blank =
    !axes.snapshot && !axes.demographics && !axes.rent && axes.supply.length === 0 &&
    !axes.news && !axes.notes && !axes.macro && !axes.poi;
  if (blank) throw new Error(`[live-context] ${regionName} 지역 축 전부 없음 — 캐시하지 않음`);
  return axes;
}

/* 단지 축 — loadNews/loadNotes 는 단지 매칭이 0건이면 지역으로 스스로 물러선다.
   여기서는 그 폴백을 **끄고**(단지 결과만 저장) 조립 단계에서 지역 캐시의 값으로
   대신한다 — 그래야 폴백 조회가 단지마다 반복되지 않는다. */
async function loadComplexAxes(
  complexId: string,
  regionName: string,
  complexName: string,
): Promise<ComplexAxes> {
  const [priceR, newsR, notesR] = await Promise.allSettled([
    resolveComplexPrice(complexId),
    loadNews(regionName, complexName, { fallbackToRegion: false }),
    loadNotes(regionName, complexName, { fallbackToRegion: false }),
  ]);
  return {
    price: settledVal(priceR, "실거래가"),
    news: settledVal(newsR, "단지 뉴스"),
    notes: settledVal(notesR, "단지 노트"),
  };
}

/* 지역 키 캐시 — 전국 218개 지역명 × 6시간. market·supply·economy 태그는 수집
   크론이 끝나는 즉시 비운다(lib/cache/invalidate.ts). */
const loadRegionAxesCached = unstable_cache(loadRegionAxes, ["live-region-axes-v1"], {
  revalidate: 21_600,
  tags: ["market", "supply", "news", "economy"],
});

const loadComplexAxesCached = unstable_cache(loadComplexAxes, ["live-complex-axes-v1"], {
  revalidate: 21_600,
  tags: ["market", "news"],
});

function assembleContext(params: {
  complexId: string | null;
  decoded: { region: string; name: string } | null;
  regionName: string;
  regionAxes: RegionAxes | null;
  complexAxes: ComplexAxes | null;
}): LiveToolContext {
  const { complexId, decoded, regionName, regionAxes, complexAxes } = params;
  const regionId = regionName ? regionIdForName(regionName) : null;
  const price = complexAxes?.price ?? null;
  const snap = regionAxes?.snapshot ?? null;
  const demo = regionAxes?.demographics ?? null;
  const supplyItems = regionAxes?.supply ?? [];

  const upcoming = supplyItems.filter((s) => s.moveInYm >= new Date().toISOString().slice(0, 7).replace("-", ""));

  return {
    generatedAt: new Date().toISOString(),
    complex:
      decoded && complexId
        ? {
            id: complexId,
            name: decoded.name,
            region: decoded.region,
            price:
              price && "ok" in price && price.ok
                ? {
                    priceKrw: price.price.priceKrw,
                    bandLabel: price.price.bandLabel,
                    latestYm: price.price.latestYm,
                    source: "국토교통부 실거래(신고) · 대표 면적대 최근 거래 평균",
                    asOf: price.price.latestYm,
                    sample: price.price.sampleSize,
                    href: `/complex/${encodeURIComponent(complexId)}`,
                  }
                : null,
          }
        : null,
    region: regionName
      ? {
          id: regionId,
          name: regionName,
          snapshot: snap
            ? {
                avgSale: snap.avgSale ?? null,
                jeonseRatio: snap.jeonseRatio ?? null,
                saleChangeMonthly: snap.saleChangeMonthly ?? null,
                tradeCount: snap.tradeCount ?? null,
                period: snap.period,
                source: "지역 시세 스냅샷(공표 통계 집계)",
                asOf: snap.period,
                sample: snap.tradeCount ?? null,
                href: regionId ? `/region/${regionId}` : null,
              }
            : null,
          demographics: demo
            ? {
                population: demo.population ?? null,
                households: demo.households ?? null,
                unsoldUnits: demo.unsoldUnits ?? null,
                period: demo.period,
                source: "KOSIS 인구·세대·미분양",
                asOf: demo.period,
                sample: null,
                href: regionId ? `/region/${regionId}` : null,
              }
            : null,
        }
      : null,
    rent: regionAxes?.rent ?? null,
    supply:
      upcoming.length > 0
        ? {
            upcomingHouseholds: upcoming.reduce((s, i) => s + (i.households ?? 0), 0),
            upcomingComplexes: upcoming.length,
            items: upcoming.slice(0, 3).map((i) => ({
              aptName: i.aptName,
              moveInYm: i.moveInYm,
              households: i.households,
            })),
            source: "청약홈 분양공고 입주예정월(자동 수집)",
            asOf: new Date().toISOString().slice(0, 10),
            sample: upcoming.length,
            href: "/apply/calendar",
          }
        : null,
    /* 단지 매칭이 있으면 단지 값, 없으면 지역 값 — 예전 loadNews/loadNotes 의
       "단지 0건 → 지역 폴백"과 같은 결과다. */
    news: complexAxes?.news ?? regionAxes?.news ?? null,
    notes: complexAxes?.notes ?? regionAxes?.notes ?? null,
    macro: regionAxes?.macro ?? null,
    poi: regionAxes?.poi ?? null,
  };
}

function resolveTarget(params: { complexId?: string | null; regionName?: string | null }) {
  const complexId = params.complexId ?? null;
  const decoded = complexId ? decodeComplexId(complexId) : null;
  const regionName = (decoded?.region ?? params.regionName ?? "").trim();
  return { complexId, decoded, regionName };
}

/**
 * 단지 또는 지역 기준의 라이브 컨텍스트 조립 — **캐시 없이** 실조회.
 * complexId 는 encodeComplexId(region, name) 형식 — 해석 실패 시 지역 축만 조립한다.
 * (AI 초안 생성처럼 "지금 값"이 필요한 곳이 쓴다. 화면은 아래 Cached 를 쓴다.)
 */
export async function buildLiveToolContext(params: {
  complexId?: string | null;
  regionName?: string | null;
}): Promise<LiveToolContext> {
  const { complexId, decoded, regionName } = resolveTarget(params);
  const [regionAxes, complexAxes] = await Promise.all([
    /* 캐시가 없는 경로에서는 "축 전부 없음" 예외를 삼켜 예전처럼 빈 컨텍스트를
       돌려준다 — 이 예외는 오직 캐시에 빈 값을 남기지 않기 위한 것이다. */
    regionName
      ? loadRegionAxes(regionName).catch((e): RegionAxes | null => {
          logger.warn("[live-context] 지역 축 조립 실패", e);
          return null;
        })
      : Promise.resolve(null),
    complexId && decoded
      ? loadComplexAxes(complexId, regionName, decoded.name)
      : Promise.resolve(null),
  ]);
  return assembleContext({ complexId, decoded, regionName, regionAxes, complexAxes });
}

/* ── [AI-01] 근거 각주 — 컨텍스트에서 각주 표를 뽑는다 ───────────────── */

export interface Footnote {
  n: number;
  label: string;
  source: string;
  asOf: string | null;
  sample: number | null;
  href: string | null;
}

export function contextFootnotes(ctx: LiveToolContext): Footnote[] {
  const rows: Omit<Footnote, "n">[] = [];
  const push = (label: string, m: AxisMeta | null | undefined) => {
    if (!m) return;
    rows.push({
      label,
      source: m.source,
      asOf: m.asOf,
      sample: m.sample ?? null,
      href: m.href ?? null,
    });
  };
  push("실거래가", ctx.complex?.price);
  push("지역 시세·거래량", ctx.region?.snapshot);
  push("전월세 실측", ctx.rent);
  push("입주 예정 물량", ctx.supply);
  push("최근 사건(뉴스)", ctx.news);
  push("이웃 임장노트", ctx.notes);
  push("인구·미분양", ctx.region?.demographics);
  push("기준금리", ctx.macro);
  push("학교(표준데이터)", ctx.poi);
  return rows.map((r, i) => ({ n: i + 1, ...r }));
}

/* ── [AI-17] 신선도 — asOf(yyyymm 또는 ISO) → 경과 일수 ─────────────── */

export function axisAgeDays(asOf: string | null, now = new Date()): number | null {
  if (!asOf) return null;
  let d: Date | null = null;
  if (/^\d{6}$/.test(asOf)) {
    d = new Date(Number(asOf.slice(0, 4)), Number(asOf.slice(4, 6)) - 1, 15);
  } else {
    const t = Date.parse(asOf);
    d = Number.isNaN(t) ? null : new Date(t);
  }
  if (!d) return null;
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / 86_400_000));
}

/* [OPT-23 → 948] 컨텍스트 캐시 — 예전엔 조립 전체를 단지 id 키 하나로 캐시했다.
   그 판단과 실측 기록은 위 "[948 · 최적화 2차]" 주석에 있다. 이제 지역 캐시와
   단지 캐시를 **여기 최상위에서** 나란히 부른다(중첩하면 안쪽 캐시가 저장되지 않는다).
   generatedAt 은 조립 시각이지만 축마다 asOf 가 따로 실리므로 "언제 데이터인지"는
   여전히 각주(ageDays)가 정직하게 말한다. */
export async function buildLiveToolContextCached(
  complexId: string | null,
  regionName: string | null,
): Promise<LiveToolContext> {
  const target = resolveTarget({ complexId, regionName });
  const [regionAxes, complexAxes] = await Promise.all([
    /* 지역 축 전부 없음(DB 포화 순간)은 캐시에 남지 않고 여기서 null 로 접힌다 —
       화면은 예전처럼 축 없는 컨텍스트를 받는다(부르는 쪽은 바뀌지 않는다). */
    target.regionName
      ? loadRegionAxesCached(target.regionName).catch((e): RegionAxes | null => {
          logger.warn("[live-context] 지역 축 캐시 조립 실패", e);
          return null;
        })
      : Promise.resolve(null),
    target.complexId && target.decoded
      ? loadComplexAxesCached(target.complexId, target.regionName, target.decoded.name)
      : Promise.resolve(null),
  ]);
  return assembleContext({ ...target, regionAxes, complexAxes });
}
