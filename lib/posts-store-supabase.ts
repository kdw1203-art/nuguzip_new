import { getServiceSupabase } from "@/lib/supabase/service";
import type { Post, PostAutomationMeta, PostComment } from "@/lib/types/post";

function rowToPost(row: Record<string, unknown>): Post {
  const rawComments = row.comments;
  const comments: PostComment[] = Array.isArray(rawComments)
    ? rawComments.map((c) => ({
        id: String((c as PostComment).id),
        authorLabel: String((c as PostComment).authorLabel ?? "익명"),
        body: String((c as PostComment).body ?? ""),
        createdAt: String(
          (c as PostComment).createdAt ?? new Date().toISOString(),
        ),
      }))
    : [];

  const vis = row.visibility as string | undefined;
  const visibility =
    vis === "link_only" || vis === "public" ? vis : undefined;

  return {
    id: String(row.id),
    authorLabel: String(row.author_label ?? "익명"),
    category: String(row.category ?? "자유"),
    city: String(row.city ?? ""),
    district: String(row.district ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    tags: Array.isArray(row.tags) ? (row.tags as string[]).map(String) : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    likeCount: Number(row.like_count ?? 0),
    commentCount: Number(row.comment_count ?? comments.length),
    viewCount: Number(row.view_count ?? 0),
    comments,
    relatedSite: row.related_site
      ? String(row.related_site)
      : undefined,
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    sourceName: row.source_name ? String(row.source_name) : undefined,
    sourcePublishedAt: row.source_published_at
      ? String(row.source_published_at)
      : undefined,
    externalKey: row.external_key ? String(row.external_key) : undefined,
    isAutomated:
      typeof row.is_automated === "boolean" ? row.is_automated : undefined,
    automationMeta:
      row.automation_meta &&
      typeof row.automation_meta === "object" &&
      !Array.isArray(row.automation_meta)
        ? (row.automation_meta as PostAutomationMeta)
        : undefined,
    visibility,
    notifyComments:
      typeof row.notify_comments === "boolean"
        ? row.notify_comments
        : undefined,
    notifyEmail: row.notify_email
      ? String(row.notify_email).trim()
      : undefined,
    ugcPostType: (() => {
      const u = row.ugc_post_type as string | undefined;
      if (u === "question" || u === "review" || u === "tip" || u === "general") return u;
      return undefined;
    })(),
  };
}

export async function readPostsSb(): Promise<Post[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => rowToPost(r as Record<string, unknown>));
}

export async function getPostSb(id: string): Promise<Post | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToPost(data as Record<string, unknown>);
}

export async function prependPostSb(post: Post): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("Supabase unavailable");
  const row: Record<string, unknown> = {
    id: post.id,
    author_label: post.authorLabel,
    category: post.category,
    city: post.city,
    district: post.district,
    title: post.title,
    body: post.body,
    tags: post.tags,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    like_count: post.likeCount,
    comment_count: post.commentCount,
    view_count: post.viewCount,
    comments: post.comments,
  };
  if (post.relatedSite) row.related_site = post.relatedSite;
  if (post.sourceUrl) row.source_url = post.sourceUrl;
  if (post.sourceName) row.source_name = post.sourceName;
  if (post.sourcePublishedAt) row.source_published_at = post.sourcePublishedAt;
  if (post.externalKey) row.external_key = post.externalKey;
  if (typeof post.isAutomated === "boolean") row.is_automated = post.isAutomated;
  if (post.automationMeta) row.automation_meta = post.automationMeta;
  if (post.visibility) row.visibility = post.visibility;
  if (typeof post.notifyComments === "boolean") {
    row.notify_comments = post.notifyComments;
  }
  if (post.notifyEmail?.trim()) {
    row.notify_email = post.notifyEmail.trim();
  }
  if (post.ugcPostType) {
    row.ugc_post_type = post.ugcPostType;
  }
  const { error } = await sb.from("posts").insert(row);
  if (error) throw error;
}

export async function updatePostSb(
  id: string,
  patch: Partial<Post>,
): Promise<Post | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.district !== undefined) row.district = patch.district;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.visibility !== undefined) row.visibility = patch.visibility;
  if (patch.relatedSite !== undefined) row.related_site = patch.relatedSite;
  if (patch.sourceUrl !== undefined) row.source_url = patch.sourceUrl;
  if (patch.sourceName !== undefined) row.source_name = patch.sourceName;
  if (patch.sourcePublishedAt !== undefined) {
    row.source_published_at = patch.sourcePublishedAt;
  }
  if (patch.externalKey !== undefined) row.external_key = patch.externalKey;
  if (patch.isAutomated !== undefined) row.is_automated = patch.isAutomated;
  if (patch.automationMeta !== undefined) row.automation_meta = patch.automationMeta;
  if (patch.notifyComments !== undefined) {
    row.notify_comments = patch.notifyComments;
  }
  if (patch.ugcPostType !== undefined) {
    row.ugc_post_type = patch.ugcPostType ?? null;
  }
  const { data, error } = await sb
    .from("posts")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return null;
  return rowToPost(data as Record<string, unknown>);
}

export async function deletePostSb(id: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("posts").delete().eq("id", id);
  if (error) return false;
  await sb.from("post_likes").delete().eq("post_id", id);
  return true;
}

export async function userHasLikedSb(
  postId: string,
  userKey: string,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { data, error } = await sb
    .from("post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_key", userKey)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function togglePostLikeSb(
  postId: string,
  userKey: string,
): Promise<{ liked: boolean; likeCount: number } | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;

  const { data: existing, error: selErr } = await sb
    .from("post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_key", userKey)
    .maybeSingle();
  if (selErr) return null;

  if (existing) {
    const { error: delErr } = await sb
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_key", userKey);
    if (delErr) return null;
  } else {
    const { error: insErr } = await sb.from("post_likes").insert({
      post_id: postId,
      user_key: userKey,
    });
    if (insErr) return null;
  }

  const { count, error: cErr } = await sb
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);
  if (cErr) return null;
  const likeCount = count ?? 0;
  const now = new Date().toISOString();
  await sb
    .from("posts")
    .update({ like_count: likeCount, updated_at: now })
    .eq("id", postId);

  return { liked: !existing, likeCount };
}

export async function incrementViewCountSb(id: string): Promise<Post | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const cur = await getPostSb(id);
  if (!cur) return null;
  const nextCount = cur.viewCount + 1;
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("posts")
    .update({ view_count: nextCount, updated_at: now })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return null;
  return rowToPost(data as Record<string, unknown>);
}

export async function appendCommentSb(
  id: string,
  comment: PostComment,
): Promise<Post | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const cur = await getPostSb(id);
  if (!cur) return null;
  const comments = [...cur.comments, comment];
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("posts")
    .update({
      comments,
      comment_count: comments.length,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return null;
  return rowToPost(data as Record<string, unknown>);
}

export async function softDeleteCommentSb(
  postId: string,
  commentId: string,
): Promise<Post | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const cur = await getPostSb(postId);
  if (!cur) return null;
  const now = new Date().toISOString();
  const comments = cur.comments.map((c) =>
    c.id === commentId
      ? { ...c, body: "[삭제된 댓글입니다]", deletedAt: now }
      : c,
  );
  const { data, error } = await sb
    .from("posts")
    .update({ comments, updated_at: now })
    .eq("id", postId)
    .select("*")
    .single();
  if (error || !data) return null;
  return rowToPost(data as Record<string, unknown>);
}
