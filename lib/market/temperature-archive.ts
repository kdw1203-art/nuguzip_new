import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";
import {
  TEMPERATURE_REGIONS,
  computeRegionTemperature,
  kstWeekStart,
  type TemperatureRegion,
} from "@/lib/market/temperature";

/**
 * N11 — 시장 온도 주간 아카이브의 읽기/쓰기.
 *
 * 계산은 lib/market/temperature.ts 한 곳에만 있고, 이 파일은 그 결과를
 * public.market_temperature_snapshot 에 넣고 빼는 일만 한다.
 *
 * ── 실패를 삼키지 않는다 ──────────────────────────────────────────────
 * 읽기 함수는 오류를 **던진다**. 빈 배열로 바꿔 돌려주면 호출한 화면이
 * "아직 쌓인 주가 없습니다"를 띄우는데, 그건 사실이 아니라 조회 실패다.
 * 두 상태를 구분하는 책임은 호출하는 쪽에 있고(랜딩 페이지는 잡아서
 * "불러오지 못했다"고 적는다), 그러려면 여기서 구분 가능한 형태로
 * 올려 보내야 한다.
 */

/** PostgREST 는 public 스키마를 기본으로 쓰므로 표 이름만 적는다. */
const T = "market_temperature_snapshot";

export type TemperatureSnapshot = {
  regionId: string;
  regionLabel: string;
  /** 'YYYY-MM-DD' — KST 기준 그 주의 월요일 */
  weekStart: string;
  score: number;
  headline: string;
  periodType: "monthly" | "weekly";
  momentumPct: number | null;
  priorPct: number | null;
  volumeRecentCount: number | null;
  volumePriorCount: number | null;
  volumeDeltaPct: number | null;
  indexLatest: number | null;
  formulaVersion: number;
  observedAt: string | null;
};

type Row = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toSnapshot(r: Row): TemperatureSnapshot {
  return {
    regionId: String(r.region_id ?? ""),
    regionLabel: String(r.region_label ?? ""),
    weekStart: String(r.week_start ?? ""),
    score: Number(r.score ?? 0),
    headline: String(r.headline ?? ""),
    periodType: r.period_type === "weekly" ? "weekly" : "monthly",
    momentumPct: num(r.momentum_pct),
    priorPct: num(r.prior_pct),
    volumeRecentCount: num(r.volume_recent_count),
    volumePriorCount: num(r.volume_prior_count),
    volumeDeltaPct: num(r.volume_delta_pct),
    indexLatest: num(r.index_latest),
    formulaVersion: Number(r.formula_version ?? 1),
    observedAt: r.observed_at ? String(r.observed_at) : null,
  };
}

/* PostgREST 타입 추론은 select 문자열이 리터럴일 때만 동작한다. 여기서는 컬럼
   목록을 상수로 이어 붙이므로 추론이 GenericStringError 유니온으로 떨어진다.
   toSnapshot() 이 어차피 필드 단위로 방어적으로 읽으므로, 여기서 Row[] 로
   좁혀 준다 — 런타임 동작은 그대로다. */
function asRows(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

const SELECT =
  "region_id,region_label,week_start,score,headline,period_type,momentum_pct,prior_pct," +
  "volume_recent_count,volume_prior_count,volume_delta_pct,index_latest,formula_version,observed_at";

/**
 * 읽기 전용 클라이언트 — Service Role 이 있으면 그대로, 없으면 publishable 키로 폴백.
 *
 * 왜 getServiceSupabase() 를 직접 쓰지 않나 (2026-07-26 /complex/compare 사고):
 * /analysis/temperature 는 `revalidate = 3600` 이라 배포 산출물에 프리렌더된다.
 * 그런데 프로덕션 빌드를 돌리는 GitHub Actions 의 `vercel build --prod` 환경에는
 * SUPABASE_SERVICE_ROLE_KEY 가 없다. 서비스 키만 보면 빌드에서 클라이언트가 null →
 * 로더가 던짐 → **실패 화면이 HTML 에 굳어** 다음 재검증(최대 1시간)까지 그대로 나간다.
 * 이 페이지는 loadError 일 때 robots noindex 까지 붙이므로, 배포할 때마다 한 시간씩
 * 색인에서 스스로 빠지는 셈이 된다. 같은 사고가 lib/market/tx-bands.ts 에 두 번,
 * lib/market/complex-pairs.ts 에 한 번 기록돼 있다.
 *
 * 폴백이 실제로 행을 읽으려면 GRANT 와 RLS 정책이 둘 다 있어야 한다. 이 표는 RLS 가
 * 켜져 있고 정책이 없었기 때문에 GRANT 만으로는 "권한은 있는데 0행"이 되어, 조회 실패가
 * "기록 없음"으로 위장됐을 것이다. 권한·정책은
 * supabase/migrations/20260726140000_public_read_for_build_prerender.sql 에 있다.
 *
 * 쓰기(runTemperatureSnapshot)는 폴백을 쓰지 않는다 — 쓰기 정책이 없으므로 anon 으로는
 * 어차피 못 쓰고, 크론은 service_role 로만 돈다.
 */
function requireClient() {
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error(
      "Supabase 읽기 키가 하나도 없어 시장 온도 아카이브를 읽을 수 없습니다 " +
        "(SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }
  return sb;
}

/** 한 지역의 주간 시계열 (오래된 주 → 최근 주). 조회 실패 시 throw. */
export async function listRegionTemperatureHistory(
  regionId: string,
  weeks = 52,
): Promise<TemperatureSnapshot[]> {
  const { data, error } = await requireClient()
    .from(T)
    .select(SELECT)
    .eq("region_id", regionId)
    .order("week_start", { ascending: false })
    .limit(weeks);
  if (error) throw new Error(`시장 온도 아카이브 조회 실패 (${regionId}): ${error.message}`);
  return asRows(data).map(toSnapshot).reverse();
}

/**
 * 모든 지역의 **가장 최근 주** 스냅샷 + 그 직전 주 값.
 *
 * PostgREST 는 DISTINCT ON 을 못 하므로 최근 2주 범위를 통째로 읽어 JS 에서
 * 지역별로 접는다. 지역 수가 62개, 주 2개 → 최대 124행이라 이 방식이 뷰를
 * 하나 더 만드는 것보다 싸다.
 */
export type TemperatureLatest = {
  current: TemperatureSnapshot;
  previous: TemperatureSnapshot | null;
};

export async function listLatestTemperatures(): Promise<{
  weekStart: string | null;
  rows: TemperatureLatest[];
}> {
  const sb = requireClient();

  // 가장 최근 주가 언제인지 먼저 확인한다 (지역마다 다를 수 있으므로 전체 최댓값).
  const { data: head, error: headErr } = await sb
    .from(T)
    .select("week_start")
    .order("week_start", { ascending: false })
    .limit(1);
  if (headErr) throw new Error(`시장 온도 아카이브 조회 실패: ${headErr.message}`);
  const latestWeek = head && head.length > 0 ? String(head[0].week_start) : null;
  if (!latestWeek) return { weekStart: null, rows: [] };

  // 최근 주와 그 직전 주를 함께 가져와 "지난주 대비"를 만든다.
  const prevWeek = shiftWeeks(latestWeek, -1);
  const { data, error } = await sb
    .from(T)
    .select(SELECT)
    .in("week_start", [latestWeek, prevWeek])
    .order("score", { ascending: false });
  if (error) throw new Error(`시장 온도 아카이브 조회 실패: ${error.message}`);

  const byRegion = new Map<string, { current?: TemperatureSnapshot; previous?: TemperatureSnapshot }>();
  for (const raw of asRows(data)) {
    const s = toSnapshot(raw);
    const slot = byRegion.get(s.regionId) ?? {};
    if (s.weekStart === latestWeek) slot.current = s;
    else slot.previous = s;
    byRegion.set(s.regionId, slot);
  }

  const rows: TemperatureLatest[] = [];
  for (const slot of byRegion.values()) {
    if (slot.current) rows.push({ current: slot.current, previous: slot.previous ?? null });
  }
  rows.sort(
    (a, b) =>
      b.current.score - a.current.score ||
      a.current.regionLabel.localeCompare(b.current.regionLabel, "ko"),
  );
  return { weekStart: latestWeek, rows };
}

/**
 * 특정 주(week_start)의 전 지역 스냅샷 — 점수 높은 순. 그 주 기록이 없으면 빈 배열.
 *
 * N23 주간 아카이브가 "그 주에 시장이 어땠는지"를 붙일 때 쓴다. 없는 주를
 * 최근 주로 대체하지 않는다 — 다른 주의 숫자를 그 주 것처럼 싣는 순간
 * 아카이브 전체를 믿을 수 없게 된다.
 */
export async function listTemperaturesForWeek(
  weekStart: string,
): Promise<TemperatureSnapshot[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return [];
  const { data, error } = await requireClient()
    .from(T)
    .select(SELECT)
    .eq("week_start", weekStart)
    .order("score", { ascending: false });
  if (error) {
    throw new Error(`시장 온도 아카이브 조회 실패 (${weekStart}): ${error.message}`);
  }
  return asRows(data).map(toSnapshot);
}

/** 아카이브에 한 주라도 값이 있는 지역 id 목록 (사이트맵용). 실패 시 throw. */
export async function listArchivedRegionIds(): Promise<string[]> {
  const { data, error } = await requireClient().from(T).select("region_id").limit(20_000);
  if (error) throw new Error(`시장 온도 아카이브 조회 실패: ${error.message}`);
  return [...new Set((data ?? []).map((r) => String(r.region_id)))].sort();
}

/** 'YYYY-MM-DD' 를 주 단위로 이동. */
export function shiftWeeks(weekStart: string, delta: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

/* ── 쓰기 ─────────────────────────────────────────────────────────────── */

export type SnapshotRunResult = {
  ok: boolean;
  weekStart: string;
  regionsTried: number;
  written: number;
  /** 지수 시계열이 없어 온도를 계산할 수 없던 지역 */
  skipped: string[];
  errors: string[];
};

/**
 * 모든 대상 지역의 현재 온도를 계산해 이번 주 행에 upsert 한다.
 *
 * 하루 두 번 호출돼도 안전하다 — 같은 주의 같은 지역이면 같은 행을 덮어쓴다.
 * 그래서 저장값의 정의가 "그 주에 마지막으로 관측한 온도"가 된다.
 */
export async function runTemperatureSnapshot(
  regions: readonly TemperatureRegion[] = TEMPERATURE_REGIONS,
): Promise<SnapshotRunResult> {
  const sb = getServiceSupabase();
  const weekStart = kstWeekStart();
  if (!sb) {
    return {
      ok: false,
      weekStart,
      regionsTried: 0,
      written: 0,
      skipped: [],
      errors: ["Supabase 서비스 키가 없습니다 (SUPABASE_SERVICE_ROLE_KEY)."],
    };
  }

  const rows: Row[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  /* 지역을 병렬로 몰아치면 지수·거래량 조회가 62×2 = 124개 동시 질의가 된다.
     PostgREST 의 service_role statement_timeout 은 8초라 그 정도로 죽지는
     않지만, 이 잡은 급할 이유가 전혀 없다. 6개씩 끊어서 돈다. */
  const CHUNK = 6;
  for (let i = 0; i < regions.length; i += CHUNK) {
    const slice = regions.slice(i, i + CHUNK);
    const results = await Promise.all(
      slice.map(async (region) => {
        try {
          const { temp } = await computeRegionTemperature(region);
          return { region, temp, error: null as string | null };
        } catch (e) {
          return {
            region,
            temp: null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );
    for (const { region, temp, error } of results) {
      if (error) {
        errors.push(`${region.label}: ${error}`);
        continue;
      }
      if (!temp) {
        // 지수 시계열이 4구간 미만이라 계산 자체가 성립하지 않는 지역.
        // 이건 실패가 아니라 "아직 근거가 없다"이므로 행을 만들지 않는다.
        skipped.push(region.label);
        continue;
      }
      rows.push({
        region_id: region.id,
        week_start: weekStart,
        region_label: region.label,
        score: temp.score,
        headline: temp.headline,
        period_type: temp.raw.periodType,
        momentum_pct: round(temp.raw.momentumPct, 4),
        prior_pct: round(temp.raw.priorPct, 4),
        momentum_points: round(temp.raw.momentumPoints, 3),
        volume_points: round(temp.raw.volumePoints, 3),
        volume_window_months: temp.raw.volumeWindowMonths,
        volume_recent_count: temp.raw.volumeRecentCount,
        volume_prior_count: temp.raw.volumePriorCount,
        volume_delta_pct: round(temp.raw.volumeDeltaPct, 4),
        index_latest: round(temp.raw.indexLatest, 4),
        index_latest_period: temp.raw.indexLatestPeriod,
        formula_version: temp.raw.formulaVersion,
        observed_at: new Date().toISOString(),
      });
    }
  }

  let written = 0;
  if (rows.length > 0) {
    const { error } = await sb
      .from(T)
      .upsert(rows, { onConflict: "region_id,week_start" });
    if (error) errors.push(`upsert 실패: ${error.message}`);
    else written = rows.length;
  }

  const result: SnapshotRunResult = {
    ok: errors.length === 0 && written === rows.length,
    weekStart,
    regionsTried: regions.length,
    written,
    skipped,
    errors,
  };
  if (!result.ok) {
    logger.error("[temperature-archive] 주간 스냅샷 일부 실패:", JSON.stringify(result));
  }
  return result;
}

function round(v: number | null, digits: number): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
