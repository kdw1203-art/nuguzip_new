/**
 * GET  /api/experts/[id]/reviews — 공개 후기 목록(최신 20건, 이메일 미포함)
 * POST /api/experts/[id]/reviews — 후기 작성 { consultationId, rating(1~5), comment? }
 *
 * [953] 후기는 답변 완료된 상담의 의뢰자만, 상담당 1건. 판정은 스토어(createReview)가
 * 상담 원장을 직접 보고 한다 — 라우트는 세션·입력 모양만 확인한다.
 * 저장 뒤 expert_profiles.rating/reviews 가 재계산되고, 전문가에게 알림이 간다.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getExpert } from "@/lib/experts/store-db";
import { createReview, listPublicReviews } from "@/lib/experts/reviews-store";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const items = await listPublicReviews(id, 20);
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = rateLimit(`expert-review:${getClientIp(req)}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id: expertId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    consultationId?: unknown;
    rating?: unknown;
    comment?: unknown;
  };
  const consultationId = String(body.consultationId ?? "").trim();
  if (!consultationId) {
    return NextResponse.json({ error: "consultationId 가 필요합니다." }, { status: 400 });
  }

  const result = await createReview({
    consultationId,
    reviewerEmail: session.user.email,
    reviewerName: session.user.name ?? null,
    rating: Number(body.rating),
    comment: body.comment == null ? null : String(body.comment),
  });
  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "forbidden"
          ? 403
          : result.code === "duplicate"
            ? 409
            : result.code === "unavailable"
              ? 503
              : 400;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }
  /* 후기가 다른 전문가의 상담에 달릴 수는 없지만(스토어가 상담→전문가를 원장에서
     읽는다), 경로의 id 와 어긋나면 클라이언트 버그이므로 응답에 실제 expertId 를 싣는다. */
  revalidatePath("/town/experts");
  revalidatePath(`/town/experts/${result.review.expertId}`);
  const expert = await getExpert(result.review.expertId).catch(() => null);
  if (expert?.ownerEmail) {
    void appendInboxNotification({
      userEmail: expert.ownerEmail,
      title: `상담 후기가 도착했어요 · ★ ${result.review.rating}`,
      body: result.review.comment ?? "별점만 남긴 후기예요.",
      actionUrl: "/my/consultations",
    }).catch(() => {});
  }
  return NextResponse.json(
    { ok: true, review: result.review, aggregate: result.aggregate, pathExpertId: expertId },
    { status: 201 },
  );
}
