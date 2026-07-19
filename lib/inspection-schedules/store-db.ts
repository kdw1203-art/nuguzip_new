import { getServiceSupabase } from "@/lib/supabase/service";

export type ScheduleStatus = "planned" | "completed" | "cancelled";

export type InspectionSchedule = {
  id: string;
  authorEmail: string;
  authorLabel: string | null;
  title: string;
  region: string;
  aptName: string | null;
  scheduledAt: string;
  durationMin: number;
  memo: string | null;
  checklist: Array<{ label: string; done: boolean }>;
  status: ScheduleStatus;
  noteId: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(r: Record<string, unknown>): InspectionSchedule {
  return {
    id: String(r.id ?? ""),
    authorEmail: String(r.author_email ?? ""),
    authorLabel: r.author_label ? String(r.author_label) : null,
    title: String(r.title ?? ""),
    region: String(r.region ?? ""),
    aptName: r.apt_name ? String(r.apt_name) : null,
    scheduledAt: String(r.scheduled_at ?? ""),
    durationMin: Number(r.duration_min ?? 60),
    memo: r.memo ? String(r.memo) : null,
    checklist: Array.isArray(r.checklist)
      ? (r.checklist as Array<{ label: string; done: boolean }>)
      : [],
    status: (r.status as ScheduleStatus) ?? "planned",
    noteId: r.note_id ? String(r.note_id) : null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

export async function listSchedules(
  authorEmail: string,
  status?: ScheduleStatus,
): Promise<InspectionSchedule[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb
    .from("inspection_schedules")
    .select("*")
    .eq("author_email", authorEmail)
    .order("scheduled_at", { ascending: true });
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []).map(mapRow);
}

export async function getSchedule(id: string): Promise<InspectionSchedule | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("inspection_schedules")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function createSchedule(input: {
  authorEmail: string;
  authorLabel?: string;
  title: string;
  region: string;
  aptName?: string;
  scheduledAt: string;
  durationMin?: number;
  memo?: string;
  checklist?: Array<{ label: string; done: boolean }>;
}): Promise<InspectionSchedule> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("Supabase 미설정");

  const { data, error } = await sb
    .from("inspection_schedules")
    .insert({
      author_email: input.authorEmail,
      author_label: input.authorLabel ?? null,
      title: input.title,
      region: input.region,
      apt_name: input.aptName ?? null,
      scheduled_at: input.scheduledAt,
      duration_min: input.durationMin ?? 60,
      memo: input.memo ?? null,
      checklist: input.checklist ?? [],
      status: "planned",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function updateScheduleStatus(
  id: string,
  status: ScheduleStatus,
  noteId?: string,
): Promise<{ ok: boolean }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false };
  const { error } = await sb
    .from("inspection_schedules")
    .update({
      status,
      note_id: noteId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return { ok: !error };
}

export async function deleteSchedule(id: string, authorEmail: string): Promise<{ ok: boolean }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false };
  const { error } = await sb
    .from("inspection_schedules")
    .delete()
    .eq("id", id)
    .eq("author_email", authorEmail);
  return { ok: !error };
}
