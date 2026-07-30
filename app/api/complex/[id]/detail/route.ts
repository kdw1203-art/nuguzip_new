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
  getAreaBands,
  getRegionRelative,
  searchComplexes,
} from "@/lib/complex/complex-store";
import { listApprovedListings } from "@/lib/listings/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbUnavailable } from "@/lib/api/db-unavailable";

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

  /* 병렬 조회 — 핵심(단지·실거래) 실패 시 503.
     지역대비·인근·매물 건수는 패널 보조라 실패해도 핵심 응답은 유지한다. */
  let complex: Awaited<ReturnType<typeof getComplexById>>;
  let transactions: Awaited<ReturnType<typeof getTransactionHistory>>;
  let posts: Awaited<ReturnType<typeof getComplexPosts>>;
  let reviews: Awaited<ReturnType<typeof getReviewSummary>>;
  let areaBands: Awaited<ReturnType<typeof getAreaBands>>;
  try {
    [complex, transactions, posts, reviews, areaBands] = await Promise.all([
      getComplexById(id),
      getTransactionHistory(id, 24),
      getComplexPosts(id, 12),
      getReviewSummary(id),
      getAreaBands(id),
    ]);
  } catch (e) {
    return dbUnavailable("complex-detail", e);
  }

  const [regionRelative, nearby, listingCount] = await Promise.all([
    getRegionRelative(id).catch(() => null),
    complex?.district
      ? searchComplexes("", complex.district, 6)
          .then((rows) =>
            rows
              .filter((c) => c.id !== id)
              .slice(0, 4)
              .map((c) => ({
                id: c.id,
                name: c.name,
                meta: [
                  c.build_year ? `${c.build_year}년` : null,
                  c.households
                    ? `${c.households.toLocaleString("ko-KR")}세대`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              })),
          )
          .catch(() => [])
      : Promise.resolve([] as { id: string; name: string; meta: string }[]),
    complex?.name
      ? listApprovedListings({ complexName: complex.name })
          .then((rows) => rows.length)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  return NextResponse.json(
    {
      complex,
      transactions,
      posts,
      reviews,
      areaBands,
      regionRelative,
      nearby,
      listingCount,
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
  const { data, error } = await sb
    .from("complex_reviews")
    .select("noise_score,parking_score,mgmt_score,neighbor_score,transport_score")
    .eq("complex_id", complexId);
  // null 은 "아직 후기가 없다"는 뜻이라 조회 실패에는 쓸 수 없다.
  if (error) throw new Error(`complex_reviews 조회 실패: ${error.message}`);
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
