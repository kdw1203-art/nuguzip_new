import { NextResponse } from "next/server";
import { listBundledDatasets } from "@/lib/public-data/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/public-data/bundled — 번들 CSV/ZIP/HWPX 카탈로그 */
export async function GET() {
  const datasets = listBundledDatasets();
  return NextResponse.json({
    datasets,
    total: datasets.length,
    hint: "HWPX/ZIP은 메타만 노출. CSV는 /api/public-data/bundled/[id] 로 샘플 조회.",
  });
}
