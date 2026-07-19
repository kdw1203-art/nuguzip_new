/**
 * 감사 로그 (Audit Log).
 * Supabase 미설정 시 서버 콘솔에만 출력.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export type AuditAction =
  | "user.ban"
  | "user.unban"
  | "user.role_change"
  | "user.plan_change"
  | "post.delete"
  | "post.pin"
  | "report.delete"
  | "report.resolve"
  | "expert.verify"
  | "expert.reject"
  | "admin.login"
  | "admin.settings_change"
  | "payment.refund"
  | "banner.create"
  | "banner.delete";

export interface AuditEntry {
  id?: string;
  actorEmail: string;
  action: AuditAction;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  createdAt?: string;
}

const inMemoryLog: AuditEntry[] = [];

export async function writeAuditLog(entry: Omit<AuditEntry, "id" | "createdAt">): Promise<void> {
  const now = new Date().toISOString();
  const full: AuditEntry = { ...entry, createdAt: now };

  // 콘솔 출력 (항상)
  logger.info(
    `[audit] ${now} | ${entry.actorEmail} | ${entry.action} | ${entry.targetType}:${entry.targetId ?? "-"} | ${JSON.stringify(entry.detail ?? {})}`,
  );

  const sb = getServiceSupabase();
  if (!sb) {
    inMemoryLog.unshift(full);
    if (inMemoryLog.length > 500) inMemoryLog.length = 500;
    return;
  }

  try {
    await sb.from("audit_logs").insert({
      actor_email: entry.actorEmail,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      detail: entry.detail ?? {},
      ip: entry.ip,
      created_at: now,
    });
  } catch (err) {
    logger.error("[audit] DB write failed:", err);
    inMemoryLog.unshift(full);
  }
}

export async function listAuditLogs(opts: {
  actorEmail?: string;
  action?: AuditAction;
  limit?: number;
  offset?: number;
}): Promise<AuditEntry[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    let entries = [...inMemoryLog];
    if (opts.actorEmail) entries = entries.filter((e) => e.actorEmail === opts.actorEmail);
    if (opts.action) entries = entries.filter((e) => e.action === opts.action);
    const start = opts.offset ?? 0;
    return entries.slice(start, start + (opts.limit ?? 50));
  }

  let query = sb
    .from("audit_logs")
    .select("id, actor_email, action, target_type, target_id, detail, ip, created_at")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.actorEmail) query = query.eq("actor_email", opts.actorEmail);
  if (opts.action) query = query.eq("action", opts.action);
  if (opts.offset) query = query.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);

  const { data } = await query;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    actorEmail: String(r.actor_email),
    action: r.action as AuditAction,
    targetType: String(r.target_type),
    targetId: r.target_id ? String(r.target_id) : null,
    detail: (r.detail as Record<string, unknown>) ?? null,
    ip: r.ip ? String(r.ip) : null,
    createdAt: String(r.created_at),
  }));
}
