import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { REGION_CATALOG, normalizeRegionKey } from "@/lib/region/catalog";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { getRegionRentYieldRows } from "@/lib/market/rent-yield";

/* [#136] 월세 전환 지도 레이어 — 지역별 월세 비중·중앙값(최근 3개월 신고).
   데이터: region_rent_yield_summary RPC(1회) + 카탈로그 좌표 조인.
   비중은 신고 건수 기준(전세 대비 월세) — 갱신·신규 미구분 한계는 클라 캡션에. */

export const runtime = "nodejs";
export const revalidate = 21600;

export async function GET() {
  const sb = getServiceSupabase();
  if (!sb) return dbUnavailable("map/rent-share", new Error("service client 미구성"));

  /* route 의 revalidate 는 응답을 캐시하지만 RPC 자체는 재생성마다 다시 돌았다.
     평균 5.5초짜리 집계라 그 재생성이 다른 요청의 DB 시간을 먹는다 —
     원천은 공유 캐시(6시간) 한 벌만 본다. */
  let data: Array<Record<string, unknown>>;
  try {
    data = await getRegionRentYieldRows();
  } catch {
    return NextResponse.json({ error: "전월세 집계 조회 실패" }, { status: 503 });
  }
  const byKey = new Map<
    string,
    { jeonse: number; wolse: number; monthly: number | null }
  >();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const name = String(r.region_name ?? "").trim();
    if (!name) continue;
    byKey.set(normalizeRegionKey(name), {
      jeonse: Number(r.jeonse_count) || 0,
      wolse: Number(r.wolse_count) || 0,
      monthly: Number(r.wolse_median_monthly_krw) || null,
    });
  }

  const items = REGION_CATALOG.map((c) => {
    const row = byKey.get(normalizeRegionKey(c.name));
    if (!row) return null;
    const total = row.jeonse + row.wolse;
    if (total < 30) return null; // 표본 부족 지역은 지도에 그리지 않는다
    return {
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      wolseShare: Math.round((row.wolse / total) * 100),
      monthlyMedianKrw: row.monthly,
      sample: total,
    };
  }).filter(Boolean);

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=21600" } },
  );
}
