import { getServiceSupabase } from "@/lib/supabase/service";
import { pushInboxNotification } from "@/lib/notifications/inbox";
import { logger } from "@/lib/log";

export type ReportStatus = "open" | "reviewed" | "dismissed";

/**
 * 신고 대상 유형.
 * - "post": 커뮤니티 글(posts) — 기존 동작. content_reports.post_id 에 적재.
 * - "note": 임장노트(inspection_notes) — content_reports.target_note_id 에 적재.
 *   (예전에는 노트 신고도 post_id 로 들어가 FK(->posts) 위반으로 접수가 실패했다.)
 */
export type ReportTargetType = "post" | "note";

/** 신고 누적 자동 숨김 임계값 — 매물(markListingReport)과 동일하게 3회. */
export const CONTENT_REPORT_HIDE_THRESHOLD = 3;

export type ContentReportRow = {
  id: string;
  post_id: string | null;
  target_note_id: string | null;
  comment_id: string | null;
  reporter_email: string | null;
  reason: string;
  report_category: string | null;
  status: ReportStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

export async function createContentReport(input: {
  /** 신고 대상 id — 하위호환을 위해 이름 유지(노트 신고 시에도 노트 id를 여기에 담는다). */
  postId: string;
  /** 생략 시 "post" (기존 호출부 하위호환). */
  targetType?: ReportTargetType;
  commentId?: string | null;
  reporterEmail?: string | null;
  reason: string;
  reportCategory?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "Supabase 미설정" };
  const targetType: ReportTargetType = input.targetType ?? "post";
  const targetColumns =
    targetType === "note"
      ? { post_id: null, target_note_id: input.postId, target_type: "note" }
      : { post_id: input.postId, target_note_id: null, target_type: "post" };
  const { error } = await sb.from("content_reports").insert({
    ...targetColumns,
    comment_id: input.commentId ?? null,
    reporter_email: input.reporterEmail ?? null,
    reason: input.reason.trim(),
    report_category: input.reportCategory?.trim() || null,
    status: "open",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listContentReports(
  status: ReportStatus | "all" = "open",
): Promise<ContentReportRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const base = () =>
    sb.from("content_reports").select("*").order("created_at", { ascending: false });
  const { data, error } =
    status === "all" ? await base() : await base().eq("status", status);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    post_id: r.post_id != null ? String(r.post_id) : null,
    target_note_id: r.target_note_id != null ? String(r.target_note_id) : null,
    comment_id: r.comment_id != null ? String(r.comment_id) : null,
    reporter_email: r.reporter_email != null ? String(r.reporter_email) : null,
    reason: String(r.reason ?? ""),
    report_category: r.report_category != null ? String(r.report_category) : null,
    status: r.status as ReportStatus,
    admin_note: r.admin_note != null ? String(r.admin_note) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  }));
}

/* ---------- 신고 누적 자동 숨김 (#7) — markListingReport 패턴을 posts·inspection_notes 로 확장 ---------- */

/** dismissed 를 제외한 누적 신고 수. post 는 댓글 신고를 제외한 본문 신고만 센다. */
async function countActiveReports(
  targetType: ReportTargetType,
  targetId: string,
): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb || !targetId) return 0;
  let q = sb
    .from("content_reports")
    .select("id", { count: "exact", head: true })
    .neq("status", "dismissed");
  q =
    targetType === "note"
      ? q.eq("target_note_id", targetId)
      : q.eq("post_id", targetId).is("comment_id", null);
  const { count, error } = await q;
  /* 못 센 것을 0 으로 돌려주면 아래 `reportCount >= 3` 자동 숨김이 절대 발동하지
     않는다 — 신고가 쌓인 콘텐츠가 조회 실패 한 번 때문에 공개된 채로 남는다.
     실패가 "가려지지 않는 쪽"으로 새는 셈이라, 못 셌으면 던진다. */
  if (error) {
    throw new Error(
      `content_reports 개수 조회 실패 (${targetType}/${targetId}): ` +
        `${error.message ?? "알 수 없는 오류"}`,
    );
  }
  return count ?? 0;
}

/**
 * 신고 대상 콘텐츠 숨김.
 * - note: 기존 컬럼 is_public=false 로 공개 목록에서 제외 + metadata.moderation 에 사유 기록.
 * - post: posts 엔 숨김 컬럼이 없어 visibility="hidden" 값으로 표시(공개 값 public/link_only 와 구분).
 *   post_id 에 매물 id 가 들어오는 기존 경로를 위해 posts 에 없으면 listings.is_hidden 도 시도한다.
 */
export async function hideReportedContent(
  targetType: ReportTargetType,
  targetId: string,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb || !targetId) return false;
  try {
    if (targetType === "note") {
      const { data } = await sb
        .from("inspection_notes")
        .select("id, metadata")
        .eq("id", targetId)
        .maybeSingle();
      if (!data) return false;
      const metadata =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {};
      const { error } = await sb
        .from("inspection_notes")
        .update({
          is_public: false,
          metadata: {
            ...metadata,
            moderation: { hidden: true, reason: "report", hiddenAt: new Date().toISOString() },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId);
      return !error;
    }
    const { data: post } = await sb
      .from("posts")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (post) {
      const { error } = await sb
        .from("posts")
        .update({ visibility: "hidden", updated_at: new Date().toISOString() })
        .eq("id", targetId);
      return !error;
    }
    const { data: listing } = await sb
      .from("listings")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (listing) {
      const { error } = await sb
        .from("listings")
        .update({ is_hidden: true, updated_at: new Date().toISOString() })
        .eq("id", targetId);
      return !error;
    }
    return false;
  } catch (e) {
    logger.warn("[moderation] hideReportedContent", e);
    return false;
  }
}

/**
 * 신고 접수 후 누적 처리 — 임계값(3회) 도달 시 자동 숨김. best-effort(실패 무시).
 */
export async function markContentReportTarget(
  targetType: ReportTargetType,
  targetId: string,
): Promise<{ ok: boolean; reportCount: number | null; hidden: boolean }> {
  try {
    const reportCount = await countActiveReports(targetType, targetId);
    if (reportCount >= CONTENT_REPORT_HIDE_THRESHOLD) {
      const hidden = await hideReportedContent(targetType, targetId);
      return { ok: true, reportCount, hidden };
    }
    return { ok: true, reportCount, hidden: false };
  } catch (e) {
    /* 자동 숨김이 조용히 건너뛰어진 것이므로 warn 이 아니라 error 로 남긴다.
       reportCount 도 0 이 아니라 null — "신고 0건"이 아니라 "못 셌다"이다. */
    logger.error(
      `[moderation] 자동 숨김 판정 실패 (${targetType}/${targetId}) — 임계값 확인을 건너뛰었습니다.`,
      e,
    );
    return { ok: false, reportCount: null, hidden: false };
  }
}

/**
 * 숨김 처리된 posts id 부분집합 조회 — 피드에서 걸러내기 위한 헬퍼.
 * (posts.visibility="hidden" 은 Post 타입에 없는 값이라 읽기 경로에서 드러나지 않는다.)
 */
export async function listHiddenPostIds(ids: string[]): Promise<Set<string>> {
  const sb = getServiceSupabase();
  const targets = ids.filter(Boolean);
  if (!sb || targets.length === 0) return new Set();
  try {
    const { data, error } = await sb
      .from("posts")
      .select("id")
      .in("id", targets)
      .eq("visibility", "hidden");
    if (error || !data) return new Set();
    return new Set(data.map((r) => String((r as { id: unknown }).id)));
  } catch (e) {
    logger.warn("[moderation] listHiddenPostIds", e);
    return new Set();
  }
}

/** 단건 숨김 여부 — 상세 페이지 게이트용. */
export async function isPostHidden(id: string): Promise<boolean> {
  const set = await listHiddenPostIds([id]);
  return set.has(id);
}

/**
 * 신고 상태 변경.
 * reviewed(처리 확정) 시 대상 콘텐츠를 숨기고, 신고자에게 인앱 알림으로 결과를 통보한다(#7).
 * dismissed 시에도 신고자에게 검토 결과를 통보한다. 부가 동작은 best-effort.
 */
export async function updateContentReportStatus(
  id: string,
  status: ReportStatus,
  adminNote?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "Supabase 미설정" };

  const { data: reportRow } = await sb
    .from("content_reports")
    .select("id, post_id, target_note_id, comment_id, reporter_email")
    .eq("id", id)
    .maybeSingle();

  const { error } = await sb
    .from("content_reports")
    .update({
      status,
      admin_note: adminNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (reportRow) {
    const noteId = reportRow.target_note_id != null ? String(reportRow.target_note_id) : null;
    const postId = reportRow.post_id != null ? String(reportRow.post_id) : null;
    const isCommentReport = reportRow.comment_id != null;
    try {
      if (status === "reviewed" && !isCommentReport) {
        if (noteId) await hideReportedContent("note", noteId);
        else if (postId) await hideReportedContent("post", postId);
      }
      const reporter =
        reportRow.reporter_email != null ? String(reportRow.reporter_email).trim() : "";
      if (reporter && (status === "reviewed" || status === "dismissed")) {
        await pushInboxNotification({
          userEmail: reporter,
          title: status === "reviewed" ? "신고 처리 완료" : "신고 검토 결과",
          body:
            status === "reviewed"
              ? "신고해 주신 콘텐츠가 운영정책 위반으로 확인되어 숨김 처리됐어요. 신고 감사합니다."
              : "신고해 주신 콘텐츠를 검토했지만 운영정책 위반을 확인하지 못했어요.",
          actionUrl: "/notifications",
        });
      }
    } catch (e) {
      logger.warn("[moderation] updateContentReportStatus side-effects", e);
    }
  }
  return { ok: true };
}
