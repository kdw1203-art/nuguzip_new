import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { loadLatestTemperatures } from "@/app/components/MarketTempWidget";
import { listRegionTemperatureHistory } from "@/lib/market/temperature-archive";
import { getRegionSnapshot, getRegionSeries } from "@/lib/market/store";
import { getBaseRate } from "@/lib/market/base-rate";

/* 분석 허브 카드 티저(#411 → UI-09) — 각 도구 카드에 "그 도구의 실측 숫자 한 줄 + 추세선".
 *
 * 사실 우선: 전부 실데이터고, 조회 실패/없음이면 해당 티저는 없다 → 카드에
 * 그 줄이 **빠진다**(가짜 수치·"—" 채움 없음). 스파크라인도 마찬가지로
 * 점이 2개 미만이면 그리지 않는다(Sparkline 이 스스로 null 을 낸다).
 *
 * [UI-09] 숫자 하나만으로는 "이 도구가 뭘 하는지"가 안 읽혔다. 같은 원천에서
 * 12구간 시계열을 함께 얹어, 카드에서 **방향**까지 보이게 한다. 새 계산은 없고
 * 이미 크론이 쌓아 둔 market_region_series / market_temperature_snapshot 을 읽는다.
 *
 * 비용: 허브는 세션 때문에 force-dynamic 이라 요청마다 돈다. 티저 원천은
 * 주간(온도)·일간(스냅샷·기준금리)·월간(지수) 갱신이라 1시간 unstable_cache 로 접는다
 * — 온도 최신값은 MarketTempWidget 의 캐시 한 벌을 그대로 재사용한다.
 * 실패는 던져서 캐시에 눌러앉지 않게 한다(위젯과 같은 판단).
 */

/** 허브 대표 지역 — 홈 KPI 와 같은 기준(강남: 지수·스냅샷·온도 모두 실존 확인). */
const HUB_REGION_ID = "gangnam";
const HUB_REGION_LABEL = "강남구";

/** 카드에 얹는 시계열 길이 — 12구간(월 12개월 / 주 12주). */
const SPARK_POINTS = 12;

/** tool-catalog 의 HubTool.teaser 키와 1:1. */
export type TeaserKey = "price" | "timing" | "temp" | "gap" | "baseRate";

export interface HubTeaser {
  /** 큰 숫자 한 줄 (예: "3,038만") */
  value: string;
  /** 그 숫자가 무엇인지 — 지역·기준 시점을 반드시 포함한다 */
  caption: string;
  /** 스파크라인 값 (오래된 → 최근). 2개 미만이면 선을 안 그린다. */
  series: readonly number[];
}

/** 있는 것만 담긴다 — 없는 키는 아예 없다(=카드에서 그 줄이 빠진다). */
export type HubTeasers = Partial<Record<TeaserKey, HubTeaser>>;

function fmtWeek(weekStart: string): string {
  const m = weekStart.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}.${m[2]} 주` : weekStart;
}

/** "2026-07-01" → "26.07" (캡션용 짧은 기준 시점) */
function fmtMonth(period: string | null): string | null {
  if (!period) return null;
  const m = period.match(/^(\d{2})(\d{2})-(\d{2})/);
  return m ? `${m[2]}.${m[3]}` : period;
}

const loadSnapshotTeaser = cache(
  unstable_cache(
    async () => {
      const snap = await getRegionSnapshot(HUB_REGION_ID);
      if (!snap || typeof snap.perM2Sale !== "number" || snap.perM2Sale <= 0) {
        throw new Error("스냅샷 없음"); // 실패/없음은 캐시에 남기지 않는다
      }
      /* per_m2_sale 은 **원** 단위다 (프로덕션 실측 30,384,497원/㎡ ≈ 3,038만).
         첫 배포에서 원값에 '만'을 붙여 "30,384,497만"으로 나갔다 — 만원 환산. */
      return {
        perM2Manwon: Math.round(snap.perM2Sale / 10_000),
        period: snap.period ?? null,
      };
    },
    ["analysis-hub-price-teaser-v1"],
    { revalidate: 3600 },
  ),
);

/* 지수 시계열 — 월간/주간 각각 한 벌씩만 읽어 캐시한다(카드 4장이 공유). */
const loadSeries = cache(
  unstable_cache(
    async () => {
      const [saleMonthly, saleWeekly, ratioMonthly] = await Promise.all([
        getRegionSeries(HUB_REGION_ID, "sale_index", "monthly", SPARK_POINTS),
        getRegionSeries(HUB_REGION_ID, "sale_index", "weekly", SPARK_POINTS),
        getRegionSeries(HUB_REGION_ID, "jeonse_ratio", "monthly", SPARK_POINTS),
      ]);
      return {
        saleMonthly: saleMonthly.map((p) => p.value),
        saleWeekly: saleWeekly.map((p) => p.value),
        ratio: ratioMonthly,
      };
    },
    ["analysis-hub-series-v1"],
    { revalidate: 3600 },
  ),
);

/** 온도 스파크라인용 12주 이력 — 최신값·헤드라인은 위젯 캐시에서 따로 온다. */
const loadTempHistory = cache(
  unstable_cache(
    () => listRegionTemperatureHistory(HUB_REGION_ID, SPARK_POINTS),
    ["analysis-hub-temp-history-v1"],
    { revalidate: 3600 },
  ),
);

export async function loadHubTeasers(): Promise<HubTeasers> {
  const [tempRes, tempHistRes, priceRes, seriesRes, baseRes] =
    await Promise.allSettled([
      loadLatestTemperatures(),
      loadTempHistory(),
      loadSnapshotTeaser(),
      loadSeries(),
      getBaseRate(),
    ]);

  const out: HubTeasers = {};
  const series = seriesRes.status === "fulfilled" ? seriesRes.value : null;

  /* ── 면적대별 실거래 시세: ㎡당 매매가 + 12개월 매매가격지수 ── */
  if (priceRes.status === "fulfilled") {
    const month = fmtMonth(priceRes.value.period);
    out.price = {
      value: `㎡당 ${priceRes.value.perM2Manwon.toLocaleString("ko-KR")}만`,
      caption: `${HUB_REGION_LABEL} 매매${month ? ` · ${month} 기준` : ""}`,
      series: series?.saleMonthly ?? [],
    };
  }

  /* ── 지역 시세 추세: 최근 12주 매매가격지수의 첫·끝 변화율 ── */
  if (series && series.saleWeekly.length >= 2) {
    const w = series.saleWeekly;
    const first = w[0];
    const last = w[w.length - 1];
    if (first > 0) {
      const pct = Math.round(((last - first) / first) * 1000) / 10;
      out.timing = {
        value: `${pct > 0 ? "+" : ""}${pct}%`,
        caption: `${HUB_REGION_LABEL} 최근 ${w.length}주 매매지수 변화`,
        series: w,
      };
    }
  }

  /* ── 지역별 시장 온도: 이번 주 점수 + 주간 이력 ── */
  if (tempRes.status === "fulfilled") {
    const row =
      tempRes.value.rows.find((r) => r.current.regionId === HUB_REGION_ID) ??
      tempRes.value.rows[0] ??
      null;
    if (row) {
      const hist =
        tempHistRes.status === "fulfilled" &&
        row.current.regionId === HUB_REGION_ID
          ? tempHistRes.value.map((s) => s.score)
          : [];
      out.temp = {
        value: `${row.current.score}/100`,
        caption: `${row.current.regionLabel} · ${row.current.headline} · ${fmtWeek(row.current.weekStart)}`,
        series: hist,
      };
    }
  }

  /* ── 전국 전세가율 랭킹: 대표 지역 전세가율 + 12개월 추이 ── */
  if (series && series.ratio.length > 0) {
    const vals = series.ratio.map((p) => p.value);
    const last = series.ratio[series.ratio.length - 1];
    out.gap = {
      value: `${Math.round(last.value * 10) / 10}%`,
      caption: `${HUB_REGION_LABEL} 전세가율${fmtMonth(last.period) ? ` · ${fmtMonth(last.period)} 기준` : ""}`,
      series: vals,
    };
  }

  /* ── 금리 스트레스 테스트: 실 기준금리(시계열 없음 — 숫자 한 줄만) ── */
  if (baseRes.status === "fulfilled" && baseRes.value?.label) {
    out.baseRate = {
      value: baseRes.value.label,
      caption: "한국은행 기준금리가 계산에 그대로 들어가요",
      series: [],
    };
  }

  return out;
}
