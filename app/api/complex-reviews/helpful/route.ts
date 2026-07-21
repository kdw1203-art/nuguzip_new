import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { markReviewHelpful } from "@/lib/complex-reviews/store-db";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * POST /api/complex-reviews/helpful
 * body: { reviewId }
 * 로그인 사용자가 후기에 "도움돼요" 를 1회 투표. 중복 시 already=true 로 응답.
 */
export async function POST(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const reviewId = String(body.reviewId ?? "").trim();
  if (!reviewId) return NextResponse.json({ error: "reviewId 가 필요합니다." }, { status: 400 });

  try {
    const result = await markReviewHelpful(reviewId, email);
    return NextResponse.json(result);
  } catch (e) {
    logger.error("[api/complex-reviews/helpful] 실패", e);
    return NextResponse.json(
      { error: "도움돼요 처리에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
