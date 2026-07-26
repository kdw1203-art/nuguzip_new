/**
 * N12 — 계절(이사철) 리포트 데이터 레이어.
 *
 * ── 무엇을 하는 페이지인가 ────────────────────────────────────────────────
 * "2~3월은 이사철이라 거래가 몰린다", "연말은 비수기다" 같은 말은 부동산에서
 * 상식처럼 오간다. 이 리포트는 그 말을 **국토교통부 실거래 신고 집계로
 * 검증**한다. 결론을 정해 두고 숫자를 고르지 않는다 — 계산식은 고정이고,
 * 나온 값이 속설과 반대면 반대라고 쓴다.
 *
 * ── 관측(observed)의 정의 — 여기가 이 파일의 핵심이다 ─────────────────────
 * 어떤 (계절, 연도)가 "관측됐다" 고 말하려면 두 조건을 다 만족해야 한다.
 *   1) 그 계절의 **모든** 달이 market_region_monthly 에 존재한다.
 *      2월만 있고 3월이 없는데 "봄 이사철 거래량" 을 말하면 절반짜리 숫자를
 *      계절 전체인 척 내놓는 것이다.
 *   2) 그 달들 중 **잠정(provisional) 월이 하나도 없다**.
 *      실거래 신고는 계약 후 30일이라 이번 달·직전 달은 계속 늘어난다.
 *      잠정 월을 계절 합계에 넣으면 그 계절이 실제보다 한산했던 것처럼 보인다
 *      — 계절성을 다루는 페이지에서 이건 단순 오차가 아니라 결론을 뒤집는 편향이다.
 * 조건을 못 채운 계절-연도는 **집계에서 빼는 게 아니라 "아직 관측 안 됨"으로
 * 이름을 붙여** 화면이 그렇게 적게 한다. 빠진 달을 조용히 무시하지 않는다.
 *
 * ── 비교는 같은 지역끼리만 ────────────────────────────────────────────────
 * 수집 지역은 달마다 다를 수 있다(백필이 진행 중이면 특히). 34개 지역이 잡힌
 * 달과 5개 지역이 잡힌 달의 거래량을 그냥 비교하면 계절성이 아니라 수집 범위를
 * 재게 된다. 그래서 모든 비교는 **비교 대상 달에 전부 등장하는 지역**(공통
 * 지역)으로 좁혀서 한다. 몇 개 지역으로 좁혔는지도 같이 돌려줘 화면이 밝힌다.
 *
 * ── 못 하는 것 ────────────────────────────────────────────────────────────
 * 기획 문서 N12 는 "청약 일정 연동" 도 적고 있지만, 청약 일정(청약홈)은 이
 * 서비스가 수집하지 않는다. 없는 데이터를 만들어 붙이지 않는다 — 별도 ETL 이
 * 생기기 전까지 이 리포트는 실거래 집계만 다룬다.
 *
 * 조회 실패는 던진다. 빈 배열로 바꾸면 "그 계절엔 거래가 없었다" 가 된다.
 */
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { isValidYm, type ReportMonthSummary } from "./monthly";

export type SeasonDef = {
  slug: string;
  /** 화면 제목에 쓰는 이름 */
  label: string;
  /** "2~3월" */
  monthsLabel: string;
  /** 1~12 */
  months: number[];
  /** 이 페이지가 검증 대상으로 삼는 통념 */
  claim: string;
  /** 통념의 근거로 흔히 드는 설명 (사실 주장 아님) */
  rationale: string;
};

/**
 * 계절은 연을 넘지 않게 잡는다. 12월·1월을 한 계절로 묶으면 "몇 년도 겨울인가"
 * 가 애매해지고, 관측 판정(위)이 두 해에 걸쳐 갈라진다. 연 내부로 끊으면
 * 계절-연도가 항상 한 해 안에서 정의된다.
 */
export const SEASONS: readonly SeasonDef[] = [
  {
    slug: "spring-move",
    label: "봄 이사철",
    monthsLabel: "2~3월",
    months: [2, 3],
    claim: "2~3월은 새 학기에 맞춘 이사 수요로 아파트 거래가 몰린다",
    rationale: "학기 시작(3월)에 맞춰 학군을 옮기려는 수요가 겨울부터 움직인다는 설명이 흔합니다.",
  },
  {
    slug: "summer-move",
    label: "여름 이사철",
    monthsLabel: "7~8월",
    months: [7, 8],
    claim: "7~8월은 방학·휴가철이라 이사와 거래가 늘어난다",
    rationale: "아이 방학과 여름 휴가에 맞춰 이사 날짜를 잡기 쉽다는 설명이 흔합니다.",
  },
  {
    slug: "autumn-move",
    label: "가을 이사철",
    monthsLabel: "9~10월",
    months: [9, 10],
    claim: "9~10월은 날씨가 좋아 이사와 거래가 다시 늘어난다",
    rationale: "추석 전후로 자금 계획이 정리되고 이사 여건이 좋다는 설명이 흔합니다.",
  },
  {
    slug: "winter-quiet",
    label: "연말 비수기",
    monthsLabel: "11~12월",
    months: [11, 12],
    claim: "11~12월은 연말이라 거래가 뜸해진다",
    rationale: "연말 자금 정리와 추운 날씨 때문에 이사를 미룬다는 설명이 흔합니다.",
  },
];

export function seasonBySlug(slug: string): SeasonDef | null {
  return SEASONS.find((s) => s.slug === slug) ?? null;
}

export function seasonPaths(): string[] {
  return SEASONS.map((s) => `/reports/season/${s.slug}`);
}

/** yyyymm */
function ymOf(year: number, month: number): string {
  return `${year}${String(month).padStart(2, "0")}`;
}

/**
 * 신고 지연 때문에 아직 확정이 아닌 월인가. lib/api/public-aggregates.ts 와 같은 규칙
 * (이번 달 + 직전 달)이며, KST 기준으로 판정한다.
 */
export function isProvisionalYm(ym: string, now = new Date()): boolean {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const cur = ymOf(kst.getUTCFullYear(), kst.getUTCMonth() + 1);
  const prevDate = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
  const prev = ymOf(prevDate.getUTCFullYear(), prevDate.getUTCMonth() + 1);
  return ym === cur || ym === prev;
}

/* ============================================================
   목록용 — 추가 조회 없이 /reports 가 이미 읽은 월 요약만으로 판정한다.
   ============================================================ */

export type SeasonAvailability = {
  def: SeasonDef;
  /** 위 "관측" 정의를 만족하는 연도 (오름차순) */
  observedYears: number[];
};

/**
 * 어떤 계절 페이지를 만들 수 있는지. `listReportMonths()` 결과를 그대로 받는
 * 순수 함수라 DB 를 다시 때리지 않는다 — /reports 와 사이트맵이 공유한다.
 */
export function listSeasonAvailability(
  months: ReportMonthSummary[],
  now = new Date(),
): SeasonAvailability[] {
  const usable = new Set(
    months.filter((m) => isValidYm(m.ym) && m.txCount > 0 && !isProvisionalYm(m.ym, now)).map((m) => m.ym),
  );
  const years = [...new Set([...usable].map((ym) => Number(ym.slice(0, 4))))].sort((a, b) => a - b);

  const out: SeasonAvailability[] = [];
  for (const def of SEASONS) {
    const observedYears = years.filter((y) => def.months.every((mo) => usable.has(ymOf(y, mo))));
    if (observedYears.length > 0) out.push({ def, observedYears });
  }
  return out;
}

/* ============================================================
   상세용 — 한 번의 조회로 전 기간을 읽고 계산은 JS 에서 한다.
   행 규모가 (지역 × 월) 이라 전국·2년치여도 수천 행이다.
   ============================================================ */

type MonthAgg = {
  ym: string;
  /** 지역명 → 그 달 집계 */
  byRegion: Map<string, { tx: number; amountSum: number; amountTx: number; pyeongSum: number; pyeongTx: number }>;
  updatedAt: string | null;
};

export type SeasonYearStat = {
  year: number;
  /** 계절 월 합계 (공통 지역 제한 없음 — 그 계절 자체의 규모) */
  txCount: number;
  /** 거래량 가중 평균 매매가 */
  avgKrw: number | null;
  /** 거래량 가중 평균 평당가 */
  perPyeongKrw: number | null;
  /** 계절 월 수 */
  monthCount: number;
  /** 같은 해 계절 외 관측 월과의 비교 — 공통 지역으로 좁혀 계산한다 */
  vsOffSeason: {
    /** 비교에 쓴 공통 지역 수 */
    regionCount: number;
    offMonths: string[];
    /** 공통 지역 기준, 계절 월 1개월당 평균 거래량 */
    seasonPerMonth: number;
    /** 공통 지역 기준, 계절 외 월 1개월당 평균 거래량 */
    offPerMonth: number;
    /** (계절 - 계절 외) / 계절 외 × 100 */
    liftPct: number;
  } | null;
};

export type SeasonYoY = {
  fromYear: number;
  toYear: number;
  regionCount: number;
  fromTx: number;
  toTx: number;
  txDeltaPct: number;
  fromAvgKrw: number | null;
  toAvgKrw: number | null;
  avgDeltaPct: number | null;
};

export type SeasonReport = {
  def: SeasonDef;
  /** 관측된 계절-연도 (오름차순) */
  years: SeasonYearStat[];
  latest: SeasonYearStat;
  /** 관측 연도가 2개 이상일 때만 채워진다 */
  yoy: SeasonYoY | null;
  /**
   * 계절성을 "여러 해에 걸쳐 반복된다" 고 말할 수 있는가.
   * 한 해만 관측됐으면 false — 그 해가 특이했을 가능성을 배제할 수 없다.
   */
  canClaimSeasonality: boolean;
  /** 아직 관측 안 된 연도와 그 이유 (예: "2026년 — 7월 잠정, 8월 없음") */
  pending: { year: number; reason: string }[];
  /** 최신 관측 연도의 거래량 상위 지역 */
  topRegions: { regionName: string; txCount: number; avgKrw: number | null }[];
  updatedAt: string | null;
};

type Raw = {
  region_name: string | null;
  month: string | null;
  transaction_count: number | null;
  avg_deal_amount_krw: number | null;
  avg_price_per_pyeong_krw: number | null;
  updated_at: string | null;
};

const SELECT =
  "region_name, month, transaction_count, avg_deal_amount_krw, avg_price_per_pyeong_krw, updated_at";

function weighted(entries: { sum: number; tx: number }): number | null {
  return entries.tx > 0 ? Math.round(entries.sum / entries.tx) : null;
}

/** 여러 달에 모두 등장한 지역만 남긴다. */
function commonRegions(monthAggs: MonthAgg[]): Set<string> {
  if (monthAggs.length === 0) return new Set();
  let acc = new Set(monthAggs[0]!.byRegion.keys());
  for (const m of monthAggs.slice(1)) {
    acc = new Set([...acc].filter((r) => m.byRegion.has(r)));
  }
  return acc;
}

function sumOver(monthAggs: MonthAgg[], regions: Set<string>): number {
  let tx = 0;
  for (const m of monthAggs) {
    for (const r of regions) tx += m.byRegion.get(r)?.tx ?? 0;
  }
  return tx;
}

/**
 * 계절 리포트. 관측된 계절-연도가 하나도 없으면 null (없는 리포트를 만들지 않는다).
 * 조회 실패는 던진다 — 부르는 쪽이 404 와 5xx 를 구분해야 한다.
 */
export async function getSeasonReport(slug: string, now = new Date()): Promise<SeasonReport | null> {
  const def = seasonBySlug(slug);
  if (!def) return null;

  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error(
      "market_region_monthly 를 읽을 수단이 없습니다 — SUPABASE_SERVICE_ROLE_KEY 도 " +
        "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY 도 설정되지 않았습니다.",
    );
  }

  const { data, error } = await sb
    .from("market_region_monthly")
    .select(SELECT)
    .eq("deal_type", "trade")
    .eq("property_type", "apartment")
    .limit(20_000);

  if (error) {
    throw new Error(
      `market_region_monthly 조회 실패 (계절 ${def.slug}) — ${error.message}` +
        `${error.code ? ` [${error.code}]` : ""}${error.hint ? ` · 힌트: ${error.hint}` : ""}`,
    );
  }
  if (!data) return null;

  /* 1) 월 × 지역으로 접는다. */
  const byYm = new Map<string, MonthAgg>();
  let updatedAt: string | null = null;
  /* SELECT 가 문자열 리터럴이 아니라 상수라 PostgREST 타입 추론이 무너진다. */
  for (const raw of data as unknown as Raw[]) {
    const ym = String(raw.month ?? "");
    const name = String(raw.region_name ?? "").trim();
    if (!isValidYm(ym) || !name) continue;
    const agg = byYm.get(ym) ?? { ym, byRegion: new Map(), updatedAt: null };
    const tx = Number(raw.transaction_count ?? 0);
    const avg = raw.avg_deal_amount_krw === null ? null : Number(raw.avg_deal_amount_krw);
    const pyeong =
      raw.avg_price_per_pyeong_krw === null ? null : Number(raw.avg_price_per_pyeong_krw);
    const cur = agg.byRegion.get(name) ?? {
      tx: 0,
      amountSum: 0,
      amountTx: 0,
      pyeongSum: 0,
      pyeongTx: 0,
    };
    cur.tx += tx;
    if (avg !== null && Number.isFinite(avg) && tx > 0) {
      cur.amountSum += avg * tx;
      cur.amountTx += tx;
    }
    if (pyeong !== null && Number.isFinite(pyeong) && tx > 0) {
      cur.pyeongSum += pyeong * tx;
      cur.pyeongTx += tx;
    }
    agg.byRegion.set(name, cur);
    const u = raw.updated_at ? String(raw.updated_at) : null;
    if (u && (!agg.updatedAt || u > agg.updatedAt)) agg.updatedAt = u;
    if (u && (!updatedAt || u > updatedAt)) updatedAt = u;
    byYm.set(ym, agg);
  }

  /* 2) 쓸 수 있는 달 = 존재하고, 거래가 있고, 잠정이 아닌 달. */
  const usable = new Map<string, MonthAgg>();
  for (const [ym, agg] of byYm) {
    if (isProvisionalYm(ym, now)) continue;
    let tx = 0;
    for (const v of agg.byRegion.values()) tx += v.tx;
    if (tx > 0) usable.set(ym, agg);
  }

  const years = [...new Set([...byYm.keys()].map((ym) => Number(ym.slice(0, 4))))].sort(
    (a, b) => a - b,
  );

  /* 3) 연도별 판정. */
  const stats: SeasonYearStat[] = [];
  const pending: { year: number; reason: string }[] = [];
  /** YoY 용: 계절 월 전부에 등장한 공통 지역과 그 지역별 합계 */
  const seasonRegionSums = new Map<
    number,
    { regions: Set<string>; byRegion: Map<string, { tx: number; sum: number; sumTx: number }> }
  >();

  for (const year of years) {
    const seasonYms = def.months.map((mo) => ymOf(year, mo));
    const missing = seasonYms.filter((ym) => !usable.has(ym));
    if (missing.length > 0) {
      const why = missing
        .map((ym) => {
          const mo = `${Number(ym.slice(4))}월`;
          if (!byYm.has(ym)) return `${mo} 집계 없음`;
          if (isProvisionalYm(ym, now)) return `${mo} 신고 진행 중(잠정)`;
          return `${mo} 거래 0건`;
        })
        .join(", ");
      pending.push({ year, reason: why });
      continue;
    }

    const seasonAggs = seasonYms.map((ym) => usable.get(ym)!);
    let txCount = 0;
    let amountSum = 0;
    let amountTx = 0;
    let pyeongSum = 0;
    let pyeongTx = 0;
    for (const m of seasonAggs) {
      for (const v of m.byRegion.values()) {
        txCount += v.tx;
        amountSum += v.amountSum;
        amountTx += v.amountTx;
        pyeongSum += v.pyeongSum;
        pyeongTx += v.pyeongTx;
      }
    }

    /* 같은 해 계절 외 관측 월 */
    const offAggs = [...usable.values()].filter(
      (m) =>
        Number(m.ym.slice(0, 4)) === year && !def.months.includes(Number(m.ym.slice(4))),
    );

    let vsOffSeason: SeasonYearStat["vsOffSeason"] = null;
    if (offAggs.length > 0) {
      const common = commonRegions([...seasonAggs, ...offAggs]);
      if (common.size > 0) {
        const seasonPerMonth = sumOver(seasonAggs, common) / seasonAggs.length;
        const offPerMonth = sumOver(offAggs, common) / offAggs.length;
        if (offPerMonth > 0) {
          vsOffSeason = {
            regionCount: common.size,
            offMonths: offAggs.map((m) => m.ym).sort(),
            seasonPerMonth,
            offPerMonth,
            liftPct: ((seasonPerMonth - offPerMonth) / offPerMonth) * 100,
          };
        }
      }
    }

    stats.push({
      year,
      txCount,
      avgKrw: weighted({ sum: amountSum, tx: amountTx }),
      perPyeongKrw: weighted({ sum: pyeongSum, tx: pyeongTx }),
      monthCount: seasonAggs.length,
      vsOffSeason,
    });

    const regions = commonRegions(seasonAggs);
    const byRegion = new Map<string, { tx: number; sum: number; sumTx: number }>();
    for (const r of regions) {
      let tx = 0;
      let sum = 0;
      let sumTx = 0;
      for (const m of seasonAggs) {
        const v = m.byRegion.get(r);
        if (!v) continue;
        tx += v.tx;
        sum += v.amountSum;
        sumTx += v.amountTx;
      }
      byRegion.set(r, { tx, sum, sumTx });
    }
    seasonRegionSums.set(year, { regions, byRegion });
  }

  if (stats.length === 0) return null;

  const latest = stats[stats.length - 1]!;

  /* 4) 전년(직전 관측 연도) 대비 — 두 해 계절 월에 모두 등장한 지역으로만. */
  let yoy: SeasonYoY | null = null;
  if (stats.length >= 2) {
    const to = latest;
    const from = stats[stats.length - 2]!;
    const a = seasonRegionSums.get(from.year);
    const b = seasonRegionSums.get(to.year);
    if (a && b) {
      const common = [...a.regions].filter((r) => b.regions.has(r));
      if (common.length > 0) {
        let fromTx = 0;
        let toTx = 0;
        let fromSum = 0;
        let fromSumTx = 0;
        let toSum = 0;
        let toSumTx = 0;
        for (const r of common) {
          const x = a.byRegion.get(r)!;
          const y = b.byRegion.get(r)!;
          fromTx += x.tx;
          toTx += y.tx;
          fromSum += x.sum;
          fromSumTx += x.sumTx;
          toSum += y.sum;
          toSumTx += y.sumTx;
        }
        const fromAvgKrw = weighted({ sum: fromSum, tx: fromSumTx });
        const toAvgKrw = weighted({ sum: toSum, tx: toSumTx });
        if (fromTx > 0) {
          yoy = {
            fromYear: from.year,
            toYear: to.year,
            regionCount: common.length,
            fromTx,
            toTx,
            txDeltaPct: ((toTx - fromTx) / fromTx) * 100,
            fromAvgKrw,
            toAvgKrw,
            avgDeltaPct:
              fromAvgKrw !== null && toAvgKrw !== null && fromAvgKrw > 0
                ? ((toAvgKrw - fromAvgKrw) / fromAvgKrw) * 100
                : null,
          };
        }
      }
    }
  }

  /* 5) 최신 관측 연도의 지역별 상위 */
  const latestSeasonAggs = def.months.map((mo) => usable.get(ymOf(latest.year, mo))!);
  const regionTotals = new Map<string, { tx: number; sum: number; sumTx: number }>();
  for (const m of latestSeasonAggs) {
    for (const [name, v] of m.byRegion) {
      const cur = regionTotals.get(name) ?? { tx: 0, sum: 0, sumTx: 0 };
      cur.tx += v.tx;
      cur.sum += v.amountSum;
      cur.sumTx += v.amountTx;
      regionTotals.set(name, cur);
    }
  }
  const topRegions = [...regionTotals.entries()]
    .map(([regionName, v]) => ({
      regionName,
      txCount: v.tx,
      avgKrw: weighted({ sum: v.sum, tx: v.sumTx }),
    }))
    .sort((x, y) => y.txCount - x.txCount)
    .slice(0, 10);

  return {
    def,
    years: stats,
    latest,
    yoy,
    canClaimSeasonality: stats.length >= 2,
    pending,
    topRegions,
    updatedAt,
  };
}

/**
 * 계산 결과를 한 문장으로. 통념과 맞으면 맞다고, 반대면 반대라고 쓴다.
 * 판정 문턱(±5%)을 코드에 고정해 두는 이유: 페이지마다 다른 기준을 쓰면
 * 결론을 고를 수 있게 되기 때문이다.
 */
export const SEASON_LIFT_THRESHOLD_PCT = 5;

export type SeasonVerdict = "higher" | "lower" | "flat";

export function seasonVerdict(liftPct: number): SeasonVerdict {
  if (liftPct >= SEASON_LIFT_THRESHOLD_PCT) return "higher";
  if (liftPct <= -SEASON_LIFT_THRESHOLD_PCT) return "lower";
  return "flat";
}

export function seasonVerdictText(v: SeasonVerdict): string {
  if (v === "higher") return "많았습니다";
  if (v === "lower") return "적었습니다";
  return "거의 차이가 없었습니다";
}
