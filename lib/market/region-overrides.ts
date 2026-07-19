/**
 * 서버 전용: market_* 스냅샷 → DemoRegion 부분 오버라이드.
 * /explore 등 지역 탐색 화면에서 데모 시세를 REB·KB 실데이터로 덮어쓴다.
 */
import "server-only";
import type { DemoRegion } from "@/lib/region/explore-data";
import { getAllRegionSnapshots } from "./store";

export type RegionOverrideMap = Record<string, Partial<DemoRegion>>;

export async function getRegionOverrides(): Promise<RegionOverrideMap> {
  let snapshots: Awaited<ReturnType<typeof getAllRegionSnapshots>>;
  try {
    snapshots = await getAllRegionSnapshots();
  } catch {
    return {};
  }
  const out: RegionOverrideMap = {};
  for (const [id, s] of snapshots) {
    const patch: Partial<DemoRegion> = {};
    if (s.perM2Sale && s.perM2Sale > 0) {
      patch.avgPrice = Math.round(s.perM2Sale * 84);
    }
    if (typeof s.saleChangeMonthly === "number") {
      patch.priceChange = Math.round(s.saleChangeMonthly * 100) / 100;
      patch.priceChangeMonth = Math.round(s.saleChangeMonthly * 100) / 100;
    }
    if (typeof s.tradeCount === "number" && s.tradeCount > 0) {
      patch.tradingVolume = Math.round(s.tradeCount);
    }
    if (typeof s.jeonseRatio === "number" && s.jeonseRatio > 0) {
      patch.jeonseRatioPct = Math.round(s.jeonseRatio * 10) / 10;
    }
    if (Object.keys(patch).length > 0) out[id] = patch;
  }
  return out;
}
