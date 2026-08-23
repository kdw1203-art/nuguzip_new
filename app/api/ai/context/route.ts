import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { buildLiveToolContext, contextFootnotes, axisAgeDays } from "@/lib/ai/live-context";
import {
  diagnosisRadar,
  riskFlags,
  timingSignals,
  counterScenarios,
} from "@/lib/ai/insight-blocks";
import { getServiceSupabase } from "@/lib/supabase/service";
import { decodeComplexId, encodeComplexId } from "@/lib/complex/complex-store";

/* [AI-16] 유사 단지 자동 후보 — 같은 지역에서 최근 3개월 거래가 활발한 단지 4곳.
   "무엇과 비교할지"부터 막히는 진입 마찰을 줄인다. 실패는 빈 배열(치명 아님). */
async function similarComplexes(
  complexId: string,
): Promise<{ id: string; name: string; txCount: number }[]> {
  const decoded = decodeComplexId(complexId);
  const sb = getServiceSupabase();
  if (!decoded || !sb) return [];
  const since = new Date();
  since.setMonth(since.getMonth() - 3);
  const sinceYm = `${since.getFullYear()}${String(since.getMonth() + 1).padStart(2, "0")}`;
  const { data, error } = await sb
    .from("market_transactions")
    .select("complex_name")
    .eq("region_name", decoded.region)
    .eq("transaction_type", "trade")
    .eq("property_type", "apartment")
    .eq("is_cancelled", false)
    .gte("contract_ym", sinceYm)
    .limit(2000);
  if (error || !Array.isArray(data)) return [];
  const counts = new Map<string, number>();
  for (const r of data as Array<{ complex_name: string | null }>) {
    const n = r.complex_name?.trim();
    if (!n || n === decoded.name) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, txCount]) => ({
      id: encodeComplexId(decoded.region, name),
      name,
      txCount,
    }));
}

/* [AI-32 2단계] 자동 로드 데이터 — 단지/지역을 받으면 실데이터 컨텍스트와
   구조화 판정(레이더·플래그·신호·반대 시나리오·각주)을 한 번에 돌려준다.
   워크벤치 2단계 미리보기와 3단계 실행 입력이 같은 응답을 쓴다(불일치 방지). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const complexId = url.searchParams.get("complexId");
  const regionName = url.searchParams.get("region");
  if (!complexId && !regionName) {
    return NextResponse.json(
      { error: "complexId 또는 region 이 필요합니다." },
      { status: 400 },
    );
  }

  const [ctx, similar] = await Promise.all([
    buildLiveToolContext({ complexId, regionName }),
    complexId ? similarComplexes(complexId) : Promise.resolve([]),
  ]);
  const footnotes = contextFootnotes(ctx);
  const now = new Date();

  return NextResponse.json(
    {
      ok: true,
      context: ctx,
      footnotes: footnotes.map((f) => ({
        ...f,
        ageDays: axisAgeDays(f.asOf, now),
      })),
      insight: {
        radar: diagnosisRadar(ctx),
        flags: riskFlags(ctx),
        signals: timingSignals(ctx),
        counters: counterScenarios(ctx),
      },
      similar,
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
