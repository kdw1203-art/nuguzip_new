import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { DISTRICT_OPTIONS } from "@/lib/ai/workbench-constants";
import { parseDistrict } from "@/lib/inspection/public-data-context-shared";
import { fetchNationalPlan } from "@/lib/national-data/fetch";
import { getRegionSnapshot, getRegionDemographics } from "@/lib/market/store";
import { matchRegionByName } from "@/lib/market/region-code";

export type AiPublicContextPlan = {
  planId: string;
  title: string;
  mode: string;
  summary: string;
  district?: string;
  fetchedAt: string;
};

export type AiPublicContext = {
  districts: string[];
  plans: AiPublicContextPlan[];
  disclaimer: string;
  fetchedAt: string;
};

const DEFAULT_COMPARE_DISTRICTS = ["강남구", "마포구"];

function districtFromWatchEntry(entry: unknown): string {
  if (typeof entry === "string") return parseDistrict(entry);
  if (entry && typeof entry === "object") {
    const o = entry as { district?: string; label?: string; region?: string };
    return parseDistrict(o.district ?? o.label ?? o.region ?? "");
  }
  return "";
}

function districtsFromWatchInput(input: Record<string, unknown>): string[] {
  const raw = input.watchRegions ?? input.watch_regions;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    const d = districtFromWatchEntry(entry);
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

function districtsFromPreferredIds(input: Record<string, unknown>): string[] {
  const raw = input.preferredDistrictIds;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    const key = String(id);
    const label =
      DISTRICT_OPTIONS.find((d) => d.id === key)?.label ?? parseDistrict(key);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

function resolveCompareDistricts(input: Record<string, unknown>): string[] {
  const fromWatch = districtsFromWatchInput(input);
  if (fromWatch.length >= 2) return fromWatch.slice(0, 2);
  if (fromWatch.length === 1) return [fromWatch[0], DEFAULT_COMPARE_DISTRICTS[1]];

  const fromPreferred = districtsFromPreferredIds(input);
  if (fromPreferred.length >= 2) return fromPreferred.slice(0, 2);
  if (fromPreferred.length === 1) return [fromPreferred[0], DEFAULT_COMPARE_DISTRICTS[1]];

  return [...DEFAULT_COMPARE_DISTRICTS];
}

function resolveDistricts(tool: AiAnalysisToolId, input: Record<string, unknown>): string[] {
  if (tool === "ai-compare") return resolveCompareDistricts(input);

  const flat = input.objective && typeof input.objective === "object" && !Array.isArray(input.objective)
    ? { ...input, ...(input.objective as Record<string, unknown>) }
    : input;

  const candidates = [
    flat.district,
    flat.region,
    flat.regionFreeText,
    flat.regionLabel,
    DISTRICT_OPTIONS.find((d) => d.id === flat.regionDistrictId)?.label,
  ];
  for (const c of candidates) {
    const d = parseDistrict(String(c ?? ""));
    if (d) return [d];
  }
  return [];
}

export async function buildAiPublicContext(
  tool: AiAnalysisToolId,
  input: Record<string, unknown>,
): Promise<AiPublicContext | null> {
  const districts = resolveDistricts(tool, input);
  if (!districts.length) return null;

  const planId = tool === "ai-compare" || input.txType === "전세" || input.txType === "월세"
    ? "molit-apt-rent"
    : "molit-apt-sale";

  const results = await Promise.allSettled(
    districts.map((district) =>
      fetchNationalPlan(planId, { district, limit: 3 }).then((r) => ({
        planId: r.planId,
        title: r.title,
        mode: r.mode,
        summary: r.summary,
        district,
        fetchedAt: r.fetchedAt,
      })),
    ),
  );

  const plans: AiPublicContextPlan[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") plans.push(r.value);
  }

  // 유형 다변화 근거(오피스텔 매매·분양권전매) — 투자/비교/타이밍 도구에 추가
  const wantsTypeMix =
    tool === "ai-compare" || tool === "ai-timing" || tool === "ai-diagnosis";
  if (wantsTypeMix) {
    const extraIds = ["molit-offi-sale", "molit-silv-sale"];
    const extra = await Promise.allSettled(
      districts.flatMap((district) =>
        extraIds.map((id) =>
          fetchNationalPlan(id, { district, limit: 2 }).then((r) => ({
            planId: r.planId,
            title: r.title,
            mode: r.mode,
            summary: r.summary,
            district,
            fetchedAt: r.fetchedAt,
          })),
        ),
      ),
    );
    for (const r of extra) {
      if (r.status === "fulfilled" && r.value.mode === "live") plans.push(r.value);
    }
  }

  // 한국부동산원·KB 시세 동향 스냅샷을 근거로 주입
  const marketPlans = await buildMarketPlans(districts);
  plans.push(...marketPlans);

  if (!plans.length) return null;

  return {
    districts,
    plans,
    disclaimer: "공공데이터·통계는 참고용이며 실시간·완전성을 보장하지 않습니다. (시세: 한국부동산원·KB)",
    fetchedAt: new Date().toISOString(),
  };
}

async function buildMarketPlans(districts: string[]): Promise<AiPublicContextPlan[]> {
  const out: AiPublicContextPlan[] = [];
  await Promise.all(
    districts.map(async (district) => {
      try {
        const matched = matchRegionByName(district);
        if (!matched) return;
        // KOSIS 보조지표(인구·세대·미분양·보급률)
        const demo = await getRegionDemographics(matched.id);
        if (demo) {
          const dparts: string[] = [];
          if (typeof demo.population === "number")
            dparts.push(`인구 ${Math.round(demo.population).toLocaleString("ko-KR")}명`);
          if (typeof demo.households === "number")
            dparts.push(`세대 ${Math.round(demo.households).toLocaleString("ko-KR")}세대`);
          if (typeof demo.unsoldUnits === "number")
            dparts.push(`미분양 ${Math.round(demo.unsoldUnits).toLocaleString("ko-KR")}호`);
          if (typeof demo.housingSupplyRatio === "number")
            dparts.push(`주택보급률 ${demo.housingSupplyRatio.toFixed(1)}%`);
          if (dparts.length > 0) {
            out.push({
              planId: "kosis-demographics",
              title: `${district} 인구·공급(KOSIS)`,
              mode: "live",
              summary: `${dparts.join(" · ")} · 기준 ${demo.period}`,
              district,
              fetchedAt: new Date().toISOString(),
            });
          }
        }
        const snap = await getRegionSnapshot(matched.id);
        if (!snap) return;
        const parts: string[] = [];
        if (typeof snap.perM2Sale === "number")
          parts.push(`㎡당 매매 ${Math.round(snap.perM2Sale / 10000)}만원`);
        if (typeof snap.saleChangeMonthly === "number")
          parts.push(`월간 매매 ${snap.saleChangeMonthly > 0 ? "+" : ""}${snap.saleChangeMonthly.toFixed(2)}%`);
        if (typeof snap.jeonseRatio === "number") parts.push(`전세가율 ${snap.jeonseRatio.toFixed(1)}%`);
        if (typeof snap.buySuperiority === "number") parts.push(`매수우위 ${snap.buySuperiority.toFixed(0)}`);
        if (typeof snap.jeonseSupply === "number") parts.push(`전세수급 ${snap.jeonseSupply.toFixed(0)}`);
        if (typeof snap.tradeCount === "number")
          parts.push(`월 거래 ${Math.round(snap.tradeCount).toLocaleString("ko-KR")}건`);
        if (parts.length === 0) return;
        out.push({
          planId: snap.source === "kb" ? "kb-market" : "reb-market",
          title: `${district} 아파트 시장동향(${snap.source === "kb" ? "KB" : "한국부동산원"})`,
          mode: "live",
          summary: `${parts.join(" · ")} · 기준 ${snap.period}`,
          district,
          fetchedAt: new Date().toISOString(),
        });
      } catch {
        // non-critical
      }
    }),
  );
  return out;
}

export function evidenceRefsFromPublicContext(
  ctx: AiPublicContext | null | undefined,
): Array<Record<string, unknown>> {
  if (!ctx?.plans?.length) return [];
  return ctx.plans.map((p) => ({
    planId: p.planId,
    title: p.title,
    summary: p.summary,
    district: p.district,
    source: "public-data-national",
    mode: p.mode,
    fetchedAt: p.fetchedAt,
  }));
}
