/**
 * GET /api/complex/[id]/trend?dealType=sale&months=24
 * 단지 월별 실거래가 시계열 — Supabase RPC 사용 (서버 집계)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/service";
import { fetchMolitDeals } from "@/lib/national-data/molit-api";
import { getComplexById, upsertTransactions } from "@/lib/complex/complex-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { id } = await params;
  const { searchParams } = req.nextUrl;
  const months = Math.min(Number(searchParams.get("months") ?? "24"), 60);

  const sb = getServiceSupabase();

  // 1. DB RPC로 집계 데이터 조회
  if (sb) {
    const { data: trend } = await sb.rpc("get_complex_monthly_trend", {
      p_complex_id: id,
      p_limit: months,
    });

    if (trend && Array.isArray(trend) && trend.length >= 3) {
      return NextResponse.json(
        { trend: [...trend].reverse(), source: "db" },
        { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120" } },
      );
    }
  }

  // 2. DB 데이터 없으면 MOLIT API에서 가져와 캐시
  const complex = await getComplexById(id);
  if (complex?.district) {
    const now = new Date();
    const fetched: Array<{
      yyyymm: string; avg_manwon: number; min_manwon: number;
      max_manwon: number; deal_count: number;
    }> = [];

    await Promise.all(
      Array.from({ length: Math.min(months, 12) }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i - 1, 1);
        const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
        return fetchMolitDeals("apt-sale", { district: complex.district, yyyymm, numOfRows: 100 })
          .then(({ deals, mode }) => {
            if (mode !== "live") return;
            const valid = deals.filter((d) => typeof d.dealManwon === "number" && d.dealManwon > 0);
            if (!valid.length) return;
            const manwons = valid.map((d) => d.dealManwon as number);
            fetched.push({
              yyyymm,
              avg_manwon: Math.round(manwons.reduce((a, b) => a + b, 0) / manwons.length),
              min_manwon: Math.min(...manwons),
              max_manwon: Math.max(...manwons),
              deal_count: valid.length,
            });
          });
      })
    );

    if (fetched.length > 0) {
      await upsertTransactions(
        fetched.map((f) => ({
          complex_id: id,
          yyyymm: f.yyyymm,
          area_m2: null,
          avg_manwon: f.avg_manwon,
          min_manwon: f.min_manwon,
          max_manwon: f.max_manwon,
          deal_count: f.deal_count,
          source: "molit",
        })),
      );
      return NextResponse.json(
        { trend: fetched.sort((a, b) => a.yyyymm.localeCompare(b.yyyymm)), source: "molit" },
        { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } },
      );
    }
  }

  return NextResponse.json(
    { trend: [], source: "empty" },
    { headers: { "Cache-Control": "public, s-maxage=300" } },
  );
}
