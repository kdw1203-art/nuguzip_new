import { NextResponse, type NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  createContentReport,
  markContentReportTarget,
  type ReportTargetType,
} from "@/lib/moderation/reports-store";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { getListingById, markListingReport } from "@/lib/listings/store-db";
import { getNote } from "@/lib/inspection/store-db";
import { logger } from "@/lib/log";

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

  // FK 버그 수정(#1) — 노트 신고 버튼도 postId 에 노트 id 를 담아 보낸다. 노트 id 를
  // content_reports.post_id(->posts FK)에 넣으면 위반이므로, 대상이 임장노트면
  // target_note_id 로 분기한다. 호출부(ReportButton 등) 시그니처는 그대로 유지.
  let targetType: ReportTargetType = "post";
  if (!commentId) {
    const note = await getNote(postId).catch(() => null);
    if (note) targetType = "note";
  }

  const res = await createContentReport({
    postId,
    targetType,
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

  // 신고 누적 처리(3회 도달 시 자동 숨김, #7) — 매물(markListingReport)뿐 아니라
  // 노트·게시글도 동일 패턴으로 확장. 댓글 신고는 본문 누적에 포함하지 않는다.
  // 실패는 best-effort 로 무시.
  if (!commentId) {
    try {
      if (targetType === "note") {
        await markContentReportTarget("note", postId);
      } else {
        const listing = await getListingById(postId);
        if (listing) await markListingReport(postId);
        else await markContentReportTarget("post", postId);
      }
    } catch (e) {
      logger.warn("[content-report] 신고 누적 처리 실패", e);
    }
  }

  return NextResponse.json({ ok: true });
}
