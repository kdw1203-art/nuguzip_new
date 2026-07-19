import { NextResponse, type NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { createContentReport } from "@/lib/moderation/reports-store";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";

const ALLOWED_CATEGORIES = new Set([
  "spam",
  "fraud",
  "defamation",
  "market_manipulation",
  "off_platform",
  "other",
]);

/**
 * POST /api/moderation/content-report
 * 커뮤니티 글·댓글 신고 (기존 /api/reports 와 구분 — 리포트 상품 생성 API와 혼동 방지)
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const postId = String(body.postId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const commentId =
    body.commentId != null && String(body.commentId).trim()
      ? String(body.commentId).trim()
      : null;
  const rawCat = String(body.reportCategory ?? body.category ?? "other").trim();
  const reportCategory = ALLOWED_CATEGORIES.has(rawCat) ? rawCat : "other";

  if (!postId) {
    return NextResponse.json({ error: "postId가 필요합니다." }, { status: 400 });
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: "신고 사유를 3자 이상 입력해 주세요." }, { status: 400 });
  }

  const res = await createContentReport({
    postId,
    commentId,
    reporterEmail: session?.user?.email?.trim() ?? null,
    reason,
    reportCategory,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error ?? "접수 실패" }, { status: 503 });
  }

  if (session?.user?.email) {
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.CONTENT_REPORT_SUBMIT,
      userEmail: session.user.email,
      path: "/api/moderation/content-report",
      metadata: { postId, reportCategory, hasComment: Boolean(commentId) },
    });
  }

  return NextResponse.json({ ok: true });
}
