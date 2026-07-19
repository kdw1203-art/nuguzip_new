/**
 * GET /api/complex/[id]/detail
 * 단지 통합 상세 데이터 — Supabase DB + 공공 API
 * 응답: { complex, transactions, reviews, posts, mode }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import {
  getComplexById,
  getTransactionHistory,
  getComplexPosts,
} from "@/lib/complex/complex-store";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "complex id가 필요합니다." }, { status: 400 });
  }

  // 병렬 조회
  const [complex, transactions, posts, reviews] = await Promise.all([
    getComplexById(id),
    getTransactionHistory(id, 12),
    getComplexPosts(id, 10),
    getReviewSummary(id),
  ]);

  return NextResponse.json(
    {
      complex,
      transactions,
      posts,
      reviews,
      fetchedAt: new Date().toISOString(),
      mode: complex ? "db" : "not_found",
    },
    {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    }
  );
}

async function getReviewSummary(complexId: string) {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("complex_reviews")
    .select("noise_score,parking_score,mgmt_score,neighbor_score,transport_score")
    .eq("complex_id", complexId);
  if (!data || data.length === 0) return null;

  const avg = (key: string) => {
    const vals = data.map((r: Record<string, number | null>) => r[key]).filter((v): v is number => v !== null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  return {
    count: data.length,
    noise: avg("noise_score"),
    parking: avg("parking_score"),
    mgmt: avg("mgmt_score"),
    neighbor: avg("neighbor_score"),
    transport: avg("transport_score"),
  };
}
