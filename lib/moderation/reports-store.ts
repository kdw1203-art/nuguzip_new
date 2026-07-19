import { getServiceSupabase } from "@/lib/supabase/service";

export type ReportStatus = "open" | "reviewed" | "dismissed";

export type ContentReportRow = {
  id: string;
  post_id: string;
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
  postId: string;
  commentId?: string | null;
  reporterEmail?: string | null;
  reason: string;
  reportCategory?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "Supabase 미설정" };
  const { error } = await sb.from("content_reports").insert({
    post_id: input.postId,
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
    post_id: String(r.post_id),
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

export async function updateContentReportStatus(
  id: string,
  status: ReportStatus,
  adminNote?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "Supabase 미설정" };
  const { error } = await sb
    .from("content_reports")
    .update({
      status,
      admin_note: adminNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
