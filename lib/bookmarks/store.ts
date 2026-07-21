import { getServiceSupabase } from "@/lib/supabase/service";

export type BookmarkTargetType =
  | "post"
  | "report"
  | "expert"
  | "meeting"
  | "market"
  | "complex"
  | "listing";

export type Bookmark = {
  id: string;
  userEmail: string;
  targetType: BookmarkTargetType;
  targetId: string;
  label?: string | null;
  note?: string | null;
  createdAt: string;
};

const memory = new Map<string, Bookmark>();

function key(userEmail: string, type: BookmarkTargetType, id: string) {
  return `${userEmail}|${type}|${id}`;
}

export async function addBookmark(
  input: Omit<Bookmark, "id" | "createdAt">,
): Promise<Bookmark> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  const k = key(input.userEmail, input.targetType, input.targetId);
  if (!sb) {
    const existing = memory.get(k);
    if (existing) return existing;
    const rec: Bookmark = { ...input, id: `mem-${k}`, createdAt: now };
    memory.set(k, rec);
    return rec;
  }
  const { data, error } = await sb
    .from("bookmarks")
    .upsert(
      {
        user_email: input.userEmail,
        target_type: input.targetType,
        target_id: input.targetId,
        label: input.label ?? null,
        note: input.note ?? null,
      },
      { onConflict: "user_email,target_type,target_id" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function removeBookmark(
  userEmail: string,
  type: BookmarkTargetType,
  id: string,
): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) {
    memory.delete(key(userEmail, type, id));
    return;
  }
  await sb
    .from("bookmarks")
    .delete()
    .eq("user_email", userEmail)
    .eq("target_type", type)
    .eq("target_id", id);
}

export async function listBookmarks(
  userEmail: string,
  type?: BookmarkTargetType,
): Promise<Bookmark[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    return [...memory.values()]
      .filter((b) => b.userEmail === userEmail && (!type || b.targetType === type))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  let q = sb
    .from("bookmarks")
    .select("*")
    .eq("user_email", userEmail)
    .order("created_at", { ascending: false })
    .limit(200);
  if (type) q = q.eq("target_type", type);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map(mapRow);
}

/** 북마크 개수 (한도 검사용 — head count). */
export async function countBookmarks(userEmail: string): Promise<number> {
  const em = userEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    return [...memory.values()].filter((b) => b.userEmail.trim().toLowerCase() === em).length;
  }
  const { count } = await sb
    .from("bookmarks")
    .select("id", { count: "exact", head: true })
    .eq("user_email", em);
  return count ?? 0;
}

export async function isBookmarked(
  userEmail: string,
  type: BookmarkTargetType,
  id: string,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return memory.has(key(userEmail, type, id));
  const { data } = await sb
    .from("bookmarks")
    .select("id")
    .eq("user_email", userEmail)
    .eq("target_type", type)
    .eq("target_id", id)
    .maybeSingle();
  return Boolean(data);
}

function mapRow(r: Record<string, unknown>): Bookmark {
  return {
    id: r.id as string,
    userEmail: r.user_email as string,
    targetType: r.target_type as BookmarkTargetType,
    targetId: r.target_id as string,
    label: (r.label as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}
