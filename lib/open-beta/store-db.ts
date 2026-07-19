import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { GatePriority, GateStatus, OpenBetaTask } from "@/lib/open-beta/checklist";

function mapRow(r: Record<string, unknown>): OpenBetaTask {
  const due = r.due_date as string | null | undefined;
  return {
    id: String(r.id),
    title: String(r.title),
    priority: String(r.priority) as GatePriority,
    status: String(r.status) as GateStatus,
    owner: (r.owner as string | null | undefined) ?? undefined,
    dueDate: due ? String(due).slice(0, 10) : undefined,
    note: (r.note as string | null | undefined) ?? undefined,
  };
}

export async function listOpenBetaTasks(): Promise<OpenBetaTask[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  const { data, error } = await sb
    .from("open_beta_tasks")
    .select("id,title,priority,status,owner,due_date,note")
    .order("priority", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function updateOpenBetaTask(
  id: string,
  patch: Partial<{
    status: GateStatus;
    owner: string | null;
    dueDate: string | null;
    note: string | null;
  }>,
): Promise<OpenBetaTask | null> {
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.owner !== undefined) payload.owner = patch.owner;
  if (patch.dueDate !== undefined) payload.due_date = patch.dueDate;
  if (patch.note !== undefined) payload.note = patch.note;

  if (Object.keys(payload).length === 0) return null;

  const { data, error } = await sb
    .from("open_beta_tasks")
    .update(payload)
    .eq("id", id)
    .select("id,title,priority,status,owner,due_date,note")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}
