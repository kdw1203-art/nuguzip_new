import "server-only";

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
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("region_rent_yield_summary", { p_months: 3 });
  if (error || !Array.isArray(data)) return null;
  const row = (data as Array<Record<string, unknown>>).find(
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
): Promise<LiveToolContext["news"]> {
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
    if (complexName) return loadNews(regionName, null); // 단지 매칭 실패 → 지역으로 폴백
    return null;
  }
  return {
    items: (data as Array<{ id: string; title: string; created_at: string }>).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      at: String(r.created_at),
    })),
    source: "누구집 자동수집 뉴스(우리 요약)",
    asOf: String((data[0] as { created_at?: string }).created_at ?? "").slice(0, 10) || null,
    sample: data.length,
    href: "/town/news",
  };
}

async function loadNotes(
  regionName: string,
  complexName: string | null,
): Promise<LiveToolContext["notes"]> {
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
    if (complexName) return loadNotes(regionName, null);
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

/**
 * 단지 또는 지역 기준의 라이브 컨텍스트 조립.
 * complexId 는 encodeComplexId(region, name) 형식 — 해석 실패 시 지역 축만 조립한다.
 */
export async function buildLiveToolContext(params: {
  complexId?: string | null;
  regionName?: string | null;
}): Promise<LiveToolContext> {
  const decoded = params.complexId ? decodeComplexId(params.complexId) : null;
  const regionName = (decoded?.region ?? params.regionName ?? "").trim();
  const complexName = decoded?.name ?? null;
  const regionId = regionName ? regionIdForName(regionName) : null;

  const [priceR, snapR, demoR, rentR, supplyR, newsR, notesR, macroR, poiR] =
    await Promise.allSettled([
      params.complexId && decoded
        ? resolveComplexPrice(params.complexId)
        : Promise.resolve(null),
      regionId ? getRegionSnapshot(regionId) : Promise.resolve(null),
      regionId ? getRegionDemographics(regionId) : Promise.resolve(null),
      regionName ? loadRent(regionName) : Promise.resolve(null),
      regionName ? getSupplyForArea(regionName, 24) : Promise.resolve([]),
      regionName ? loadNews(regionName, complexName) : Promise.resolve(null),
      regionName ? loadNotes(regionName, complexName) : Promise.resolve(null),
      loadMacro(),
      regionName ? loadPoi(regionName) : Promise.resolve(null),
    ]);

  const val = <T,>(r: PromiseSettledResult<T>): T | null => {
    if (r.status === "fulfilled") return r.value;
    logger.warn("[live-context] 축 조회 실패", r.reason);
    return null;
  };

  const price = val(priceR);
  const snap = val(snapR);
  const demo = val(demoR);
  const supplyItems = val(supplyR) ?? [];

  const upcoming = supplyItems.filter((s) => s.moveInYm >= new Date().toISOString().slice(0, 7).replace("-", ""));

  return {
    generatedAt: new Date().toISOString(),
    complex:
      decoded && params.complexId
        ? {
            id: params.complexId,
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
                    href: `/complex/${encodeURIComponent(params.complexId)}`,
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
    rent: val(rentR),
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
    news: val(newsR),
    notes: val(notesR),
    macro: val(macroR),
    poi: val(poiR),
  };
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
