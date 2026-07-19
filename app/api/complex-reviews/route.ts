import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { listReviews, upsertReview, calcSummary } from "@/lib/complex-reviews/store-db";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const complexId = req.nextUrl.searchParams.get("complexId");
  if (!complexId) return NextResponse.json({ error: "complexId 가 필요합니다." }, { status: 400 });
  const reviews = await listReviews(complexId);
  const summary = calcSummary(reviews);
  return NextResponse.json({ reviews, summary });
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 }); }

  const complexId = String(body.complexId ?? "").trim();
  const complexName = String(body.complexName ?? "").trim();
  if (!complexId || !complexName) return NextResponse.json({ error: "complexId, complexName 이 필요합니다." }, { status: 400 });

  const toScore = (v: unknown, fallback = 3) => {
    const n = Number(v);
    return isNaN(n) ? fallback : Math.min(5, Math.max(1, Math.round(n)));
  };

  const review = await upsertReview({
    complexId,
    complexName,
    authorEmail: session.user.email,
    noiseScore: toScore(body.noiseScore),
    parkingScore: toScore(body.parkingScore),
    mgmtScore: toScore(body.mgmtScore),
    neighborScore: toScore(body.neighborScore),
    transportScore: toScore(body.transportScore),
    comment: body.comment ? String(body.comment).slice(0, 500) : null,
  });
  return NextResponse.json(review, { status: 201 });
}
