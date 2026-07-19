import type { EconomyRow, EconomyThermometerGauge } from "@/lib/ai/workbench-constants";
import {
  ECONOMY_FULL,
  ECONOMY_MONITOR_CARD_IDS,
  ECONOMY_THERMOMETER,
  economyRowsByMonitorOrder,
} from "@/lib/ai/workbench-constants";

/** GET /api/economy/monitor 및 클라이언트 훅 공통 페이로드 (외부 API 연동 시 동일 스키마 유지) */
export type EconomyMonitorPayload = {
  asOf: string;
  primaryRows: EconomyRow[];
  moreRows: EconomyRow[];
  thermometer: EconomyThermometerGauge[];
  source: "demo" | "live";
};

export function buildEconomyMonitorDemoPayload(now: Date = new Date()): EconomyMonitorPayload {
  const primaryIdSet = new Set<string>([...ECONOMY_MONITOR_CARD_IDS]);
  return {
    asOf: now.toISOString(),
    primaryRows: economyRowsByMonitorOrder(),
    moreRows: ECONOMY_FULL.filter((e) => !primaryIdSet.has(e.id)),
    thermometer: ECONOMY_THERMOMETER.map((g) => ({ ...g })),
    source: "demo",
  };
}
