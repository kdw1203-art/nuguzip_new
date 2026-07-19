import { fetchNationalPlan } from "@/lib/national-data/fetch";
import type { NationalPlanFetchResult } from "@/lib/national-data/types";
import { readPublicDataCache, writePublicDataCache } from "@/lib/public-data";
import { getRegionSnapshot, getRegionDemographics } from "@/lib/market/store";
import { matchRegionByName } from "@/lib/market/region-code";
import {
  parseDistrict,
  planIdsForIntent,
  type InspectionIntent,
  type InspectionPlanSlice,
  type InspectionPublicContext,
  publicDataRefsFromContext,
} from "@/lib/inspection/public-data-context-shared";

export type {
  InspectionIntent,
  InspectionPlanSlice,
  InspectionPublicContext,
  PublicDataRef,
} from "@/lib/inspection/public-data-context-shared";

export { parseDistrict, publicDataRefsFromContext, planIdsForIntent };

function sliceFromResult(r: NationalPlanFetchResult): InspectionPlanSlice {
  return {
    planId: r.planId,
    title: r.title,
    mode: r.mode,
    summary: r.summary,
    items: r.items,
    portalUrl: r.portalUrl,
    notice: r.notice,
    fetchedAt: r.fetchedAt,
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(district: string, aptName: string | undefined, intent: InspectionIntent): string {
  return `insp-ctx:${district}:${aptName ?? ""}:${intent}`;
}

export async function getInspectionPublicContext(input: {
  district?: string;
  region?: string;
  aptName?: string;
  intent?: InspectionIntent;
}): Promise<InspectionPublicContext | null> {
  const district = parseDistrict(input.district ?? input.region ?? "");
  if (!district) return null;

  const intent = input.intent ?? "실거주";
  const aptName = input.aptName?.trim() || undefined;
  const key = cacheKey(district, aptName, intent);
  const cached = await readPublicDataCache(key);
  if (cached) {
    return cached as InspectionPublicContext;
  }

  const ids = planIdsForIntent(intent);

  const results = await Promise.allSettled(
    ids.map((id) =>
      fetchNationalPlan(id, {
        district,
        q: aptName,
        limit: 5,
      }),
    ),
  );

  const plans = results
    .filter((r): r is PromiseFulfilledResult<NationalPlanFetchResult> => r.status === "fulfilled")
    .map((r) => sliceFromResult(r.value));

  const weather = plans.find((p) => p.planId === "weather-short");
  const air = plans.find((p) => p.planId === "air-quality");

  const checklistHints: string[] = [];
  if (air?.summary && /나쁨|매우|주의/.test(air.summary)) {
    checklistHints.push("대기질 — 창문·환기·미세먼지 확인");
  }
  const commercial = plans.find((p) => p.planId === "commercial-district");
  if (commercial?.items?.length) {
    checklistHints.push("상권·유동 — 소음·야간 조도 확인");
  }
  const parking = plans.find((p) => p.planId === "parking-standard");
  if (parking?.items?.length) {
    checklistHints.push("주차 — 방문·거주 주차 난이도 확인");
  }
  const park = plans.find((p) => p.planId === "city-park-standard");
  if (park?.items?.length) {
    checklistHints.push("공원·녹지 — 도보 생활권·놀이터 확인");
  }
  const childcare = plans.find((p) => p.planId === "childcare-zone");
  if (childcare?.items?.length) {
    checklistHints.push("어린이집·보호구역 — 통학·안전 확인");
  }
  const mixed = plans.find((p) => p.planId === "multi-use-business");
  if (mixed?.items?.length) {
    checklistHints.push("상업·주거 혼합 — 소음·유동·야간 조도");
  }

  // 한국부동산원·KB 시세 동향 주입 (있을 때만)
  let marketHint: string | undefined;
  let market: InspectionPublicContext["market"];
  try {
    const matched = matchRegionByName(district);
    const snap = matched ? await getRegionSnapshot(matched.id) : null;
    if (snap) {
      market = {
        source: snap.source,
        period: snap.period,
        perM2Sale: snap.perM2Sale,
        saleChangeMonthly: snap.saleChangeMonthly,
        jeonseRatio: snap.jeonseRatio,
        tradeCount: snap.tradeCount,
        buySuperiority: snap.buySuperiority,
        jeonseSupply: snap.jeonseSupply,
      };
      const parts: string[] = [];
      if (typeof snap.saleChangeMonthly === "number")
        parts.push(`월간 매매 ${snap.saleChangeMonthly > 0 ? "+" : ""}${snap.saleChangeMonthly.toFixed(2)}%`);
      if (typeof snap.jeonseRatio === "number") parts.push(`전세가율 ${snap.jeonseRatio.toFixed(1)}%`);
      if (typeof snap.buySuperiority === "number")
        parts.push(`매수우위 ${snap.buySuperiority.toFixed(0)}`);
      if (typeof snap.tradeCount === "number")
        parts.push(`월 거래 ${Math.round(snap.tradeCount).toLocaleString("ko-KR")}건`);
      // KOSIS 보조지표 — 미분양/주택보급률은 임장 판단에 직접 유용
      try {
        const demo = await getRegionDemographics(matched!.id);
        if (demo) {
          if (typeof demo.unsoldUnits === "number") {
            parts.push(`미분양 ${Math.round(demo.unsoldUnits).toLocaleString("ko-KR")}호`);
            if (demo.unsoldUnits >= 1000) {
              checklistHints.push("공급 — 미분양 물량 많음, 인근 신규분양·할인분양 여부 확인");
            }
          }
          if (typeof demo.housingSupplyRatio === "number")
            parts.push(`주택보급률 ${demo.housingSupplyRatio.toFixed(1)}%`);
        }
      } catch {
        // non-critical
      }
      if (parts.length > 0) {
        const label = snap.source === "kb" ? "KB" : "한국부동산원";
        marketHint = `${label} 기준 ${district} 아파트 ${parts.join(" · ")}`;
        if (typeof snap.buySuperiority === "number") {
          checklistHints.push(
            snap.buySuperiority >= 100
              ? "시세 — 매수우위(수요>공급) 구간, 호가 협상 여지 적음"
              : "시세 — 매수자 우위 구간, 급매·협상 여지 점검",
          );
        }
      }
    }
  } catch {
    // non-critical
  }

  const value: InspectionPublicContext = {
    district,
    aptName,
    intent,
    fetchedAt: new Date().toISOString(),
    plans,
    weatherHint: weather?.summary,
    airQualityHint: air?.summary,
    checklistHints,
    marketHint,
    market,
  };
  await writePublicDataCache(key, value, CACHE_TTL_MS);
  return value;
}
