import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

const memory = new Map<string, InboxItem[]>();

function memList(email: string): InboxItem[] {
  const key = normEmail(email);
  return [...(memory.get(key) ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

function memPush(email: string, row: InboxItem) {
  const key = normEmail(email);
  const cur = memory.get(key) ?? [];
  cur.unshift(row);
  memory.set(key, cur);
}

export async function listInboxForEmail(email: string): Promise<InboxItem[]> {
  const key = normEmail(email);
  const sb = getServiceSupabase();
  if (!sb) return memList(email);
  const { data, error } = await sb
    .from("user_inbox_notifications")
    .select("id, title, body, action_url, read_at, created_at")
    .eq("user_email", key)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    body: r.body as string,
    actionUrl: (r.action_url as string | null) ?? null,
    readAt: (r.read_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function appendInboxNotification(input: {
  userEmail: string;
  title: string;
  body: string;
  actionUrl?: string | null;
}): Promise<void> {
  const key = normEmail(input.userEmail);
  const row: InboxItem = {
    id: `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl ?? null,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  const sb = getServiceSupabase();
  if (!sb) {
    memPush(key, row);
    return;
  }
  const { error } = await sb.from("user_inbox_notifications").insert({
    user_email: key,
    title: input.title,
    body: input.body,
    action_url: input.actionUrl ?? null,
  });
  if (error && process.env.NODE_ENV !== "production") {
    logger.warn("[inbox] insert skipped:", error.message);
  }
}

export async function markInboxItemRead(
  email: string,
  id: string,
): Promise<boolean> {
  const key = normEmail(email);
  const sb = getServiceSupabase();
  if (!sb) {
    const list = memory.get(key) ?? [];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    list[i] = { ...list[i], readAt: new Date().toISOString() };
    memory.set(key, list);
    return true;
  }
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("user_inbox_notifications")
    .update({ read_at: now })
    .eq("id", id)
    .eq("user_email", key)
    .select("id")
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function markAllInboxRead(email: string): Promise<void> {
  const key = normEmail(email);
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const list = memory.get(key) ?? [];
    memory.set(
      key,
      list.map((x) => ({ ...x, readAt: x.readAt ?? now })),
    );
    return;
  }
  await sb
    .from("user_inbox_notifications")
    .update({ read_at: now })
    .eq("user_email", key)
    .is("read_at", null);
}

/** 미읽음 알림 수 — 헤더 벨 배지용(B10). read_at null 카운트. */
export async function countUnreadInbox(email: string): Promise<number> {
  const key = normEmail(email);
  if (!key) return 0;
  const sb = getServiceSupabase();
  if (!sb) {
    const list = memory.get(key) ?? [];
    return list.filter((x) => !x.readAt).length;
  }
  const { count } = await sb
    .from("user_inbox_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_email", key)
    .is("read_at", null);
  return count ?? 0;
}

/** Alias for appendInboxNotification — preferred name going forward */
export const pushInboxNotification = appendInboxNotification;
