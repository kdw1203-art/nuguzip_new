import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export type AuditEntry = {
  action: string;
  targetType?: string;
  targetId?: string;
  note?: string;
  metadata?: Record<string, unknown>;
};

/**
 * 관리자 서버 액션 안에서 호출해 audit 이벤트를 남깁니다.
 * Supabase 미설정 시 console.info 로 폴백하여 UX 를 막지 않습니다.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const session = await safeAuth();
  if (!session || session.user.role !== "admin") return;
  const sb = getServiceSupabase();
  const payload = {
    actor_email: session.user.email ?? "unknown",
    actor_role: session.user.role ?? "admin",
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    note: entry.note ?? null,
    metadata: entry.metadata ?? {},
  };
  if (!sb) {
    logger.info("[audit:stub]", payload);
    return;
  }
  const { error } = await sb.from("admin_audit_log").insert(payload);
  if (error) logger.warn("[audit]", error.message);
}

export type AuditRow = {
  id: string;
  actor_email: string;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function listAuditLog(limit = 100): Promise<AuditRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as AuditRow[];
}
