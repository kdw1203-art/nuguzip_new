/** API `scheduledAt`/`planned` ↔ UI `scheduled_at`/`scheduled` 정규화 */

export type NormalizedSchedule = {
  id: string;
  title: string;
  scheduled_at: string;
  region?: string;
  memo?: string;
  schedule_type?: "solo" | "group";
  status?: string;
  noteId?: string;
};

export function normalizeScheduleItem(raw: Record<string, unknown>): NormalizedSchedule {
  const statusRaw = raw.status ? String(raw.status) : undefined;
  const status = statusRaw === "scheduled" ? "planned" : statusRaw;
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? ""),
    scheduled_at: String(raw.scheduled_at ?? raw.scheduledAt ?? ""),
    region: raw.region ? String(raw.region) : undefined,
    memo: raw.memo ? String(raw.memo) : undefined,
    schedule_type: raw.schedule_type === "group" ? "group" : "solo",
    status,
    noteId: raw.noteId ?? raw.note_id ? String(raw.noteId ?? raw.note_id) : undefined,
  };
}

export function normalizeScheduleList(items: unknown[]): NormalizedSchedule[] {
  return items
    .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
    .map(normalizeScheduleItem);
}

/** 예정·진행 중 일정 (planned / legacy scheduled) */
export function isActiveSchedule(s: NormalizedSchedule): boolean {
  if (!s.status) return true;
  return s.status === "planned" || s.status === "scheduled";
}
