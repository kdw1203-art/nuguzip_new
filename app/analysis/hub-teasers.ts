import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { loadLatestTemperatures } from "@/app/components/MarketTempWidget";
import { getRegionSnapshot } from "@/lib/market/store";
import { getBaseRate } from "@/lib/market/base-rate";

/* 분석 허브 카드 티저(#411) — 각 도구 카드에 "그 도구의 실측 숫자 한 줄".
 *
 * 사실 우선: 전부 실데이터고, 조회 실패/없음이면 해당 티저는 null → 카드에
 * 그 줄이 **빠진다**(가짜 수치·"—" 채움 없음).
 *
 * 비용: 허브는 세션 때문에 force-dynamic 이라 요청마다 돈다. 티저 원천은
 * 주간(온도)·일간(스냅샷·기준금리) 갱신이라 1시간 unstable_cache 로 접는다
 * — 온도는 MarketTempWidget 의 캐시 한 벌을 그대로 재사용한다.
 * 실패는 던져서 캐시에 눌러앉지 않게 한다(위젯과 같은 판단).
 */

/** 허브 대표 지역 — 홈 KPI 와 같은 기준(강남: 지수·스냅샷·온도 모두 실존 확인). */
const HUB_REGION_ID = "gangnam";
const HUB_REGION_LABEL = "강남구";

export interface HubTeasers {
  /** 시세·타이밍 — 온도 스냅샷의 지수 모멘텀(최근 3구간 평균 변동률) */
  timing: { momentumPct: number; regionLabel: string } | null;
  /** 시장 온도 — 이번 주 점수·헤드라인·기준 주 */
  temp: { score: number; headline: string; weekLabel: string } | null;
  /** 면적대별 실거래 — 대표 지역 ㎡당 매매가(만원) */
  price: { perM2Manwon: number; regionLabel: string; period: string | null } | null;
  /** 시나리오 — 실 기준금리 라벨 */
  baseRate: string | null;
}

function fmtWeek(weekStart: string): string {
  const m = weekStart.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}.${m[2]} 주` : weekStart;
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

export async function loadHubTeasers(): Promise<HubTeasers> {
  const [tempRes, priceRes, baseRes] = await Promise.allSettled([
    loadLatestTemperatures(),
    loadSnapshotTeaser(),
    getBaseRate(),
  ]);

  let temp: HubTeasers["temp"] = null;
  let timing: HubTeasers["timing"] = null;
  if (tempRes.status === "fulfilled") {
    const row =
      tempRes.value.rows.find((r) => r.current.regionId === HUB_REGION_ID) ??
      tempRes.value.rows[0] ??
      null;
    if (row) {
      temp = {
        score: row.current.score,
        headline: row.current.headline,
        weekLabel: fmtWeek(row.current.weekStart),
      };
      if (typeof row.current.momentumPct === "number") {
        timing = {
          momentumPct: Math.round(row.current.momentumPct * 100) / 100,
          regionLabel: row.current.regionLabel || HUB_REGION_LABEL,
        };
      }
    }
  }

  return {
    timing,
    temp,
    price:
      priceRes.status === "fulfilled"
        ? { ...priceRes.value, regionLabel: HUB_REGION_LABEL }
        : null,
    baseRate:
      baseRes.status === "fulfilled" ? (baseRes.value?.label ?? null) : null,
  };
}
