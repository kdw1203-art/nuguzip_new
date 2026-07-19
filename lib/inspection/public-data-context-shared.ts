/** 클라이언트·서버 공용 — Node/fs 의존 없음 */

export type InspectionIntent = "실거주" | "투자" | "전월세" | "정비사업";

export type InspectionPlanSlice = {
  planId: string;
  title: string;
  mode: string;
  summary: string;
  items: unknown[];
  portalUrl?: string;
  notice?: string;
  fetchedAt: string;
};

export type InspectionPublicContext = {
  district: string;
  aptName?: string;
  intent: InspectionIntent;
  fetchedAt: string;
  plans: InspectionPlanSlice[];
  weatherHint?: string;
  airQualityHint?: string;
  checklistHints: string[];
  /** 한국부동산원·KB 시세 동향 한 줄 요약 (있을 때만) */
  marketHint?: string;
  /** 시장 동향 구조화 스냅샷 (AI 분석 컨텍스트용) */
  market?: {
    source: string;
    period: string;
    perM2Sale?: number;
    saleChangeMonthly?: number;
    jeonseRatio?: number;
    tradeCount?: number;
    buySuperiority?: number;
    jeonseSupply?: number;
  };
};

export function parseDistrict(region: string): string {
  const trimmed = region.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/([가-힣]+(?:구|군|시))/);
  return m?.[1] ?? trimmed;
}

export type PublicDataRef = {
  planId: string;
  title: string;
  mode: string;
  fetchedAt: string;
  summary?: string;
};

export function publicDataRefsFromContext(ctx: InspectionPublicContext): PublicDataRef[] {
  return ctx.plans.map((p) => ({
    planId: p.planId,
    title: p.title,
    mode: p.mode,
    fetchedAt: p.fetchedAt,
    summary: p.summary,
  }));
}

export function planIdsForIntent(intent: InspectionIntent): string[] {
  const sale = intent === "전월세" ? "molit-apt-rent" : "molit-apt-sale";
  const base = [
    sale,
    "molit-apt-sale-detail",
    "molit-building-registry",
    "weather-short",
    "air-quality",
    "commercial-district",
    "public-facility-open",
    "parking-standard",
  ];
  if (intent === "실거주") {
    base.push("city-park-standard", "childcare-zone");
  }
  if (intent === "투자") {
    base.push("multi-use-business", "molit-offi-sale", "molit-silv-sale");
  }
  if (intent === "전월세") {
    base.push("molit-offi-rent");
  }
  if (intent === "정비사업") {
    base.push("molit-building-registry", "multi-use-business");
  }
  return base;
}
