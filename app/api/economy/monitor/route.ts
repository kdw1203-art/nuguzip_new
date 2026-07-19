import { NextResponse } from "next/server";
import { buildEconomyMonitorDemoPayload } from "@/lib/ai/economy-monitor-contract";

/** 데모: 고정 상수 기반 스냅샷. 실제 연동 시 외부 지표 API를 조합해 동일 스키마로 반환하면 됩니다. */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildEconomyMonitorDemoPayload());
}
