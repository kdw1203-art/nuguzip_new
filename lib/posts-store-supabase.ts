import { getServiceSupabase } from "@/lib/supabase/service";
import {
  canDeleteComment,
  softDeleteCommentBody,
  type CommentDeleteActor,
} from "@/lib/moderation/comment-soft-delete";
import type { Post, PostAutomationMeta, PostComment } from "@/lib/types/post";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rowToPost(row: Record<string, unknown>): Post {
  const rawComments = row.comments;
  /* authorEmail 은 의도적으로 옮겨 담지 않는다 — 이 Post 는 그대로 API 응답으로 나가고,
     댓글 작성자 이메일은 공개할 값이 아니다. 삭제 권한 판정은 저장된 원본 JSON 을
     직접 읽는 softDeleteCommentSb 가 한다. */
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
    boostUntil: typeof row.boost_until === "string" ? row.boost_until : null,
    comments,
    relatedSite: row.related_site
      ? String(row.related_site)
      : undefined,
    complexId: row.complex_id ? String(row.complex_id) : undefined,
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

/**
 * 한 번에 읽어 오는 글 수 상한.
 *
 * 예전에는 상한이 아예 없었다 — `select=*` 에 `order=created_at.desc` 만.
 * 이 함수는 홈·타운·검색·내 활동·커뮤니티 API 가 전부 거쳐 가는 길목이라,
 * 글이 하루치씩 쌓이는 만큼 요청 하나가 매일 조금씩 더 무거워졌다. 게다가
 * `*` 는 본문(body)과 댓글(jsonb)까지 통째로 들고 온다. "지금은 행이 적으니
 * 괜찮다"는 건 오늘에 대한 사실일 뿐, 설계에 대한 사실이 아니다.
 *
 * 그래서 상한을 둔다. 다만 상한은 **자르는 것**이므로, 전수 집계가 필요한
 * 곳(관리자 통계의 총계 등)은 이 목록으로 세지 말고 count 질의를 써야 한다.
 */
export const POSTS_READ_LIMIT = 500;

/** 최신순 글 목록 — 기본 상한 {@link POSTS_READ_LIMIT} 건. */
export async function readPostsSb(
  limit: number = POSTS_READ_LIMIT,
): Promise<Post[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, limit));
  if (error || !data) return [];
  return data.map((r) => rowToPost(r as Record<string, unknown>));
}

/* 조회 실패는 "그런 글이 없다"가 아니다.
 *
 * 예전에는 `if (error || !data) return null` 이었다. 호출부는 그 null 을 전부
 * 404("게시글을 찾을 수 없습니다")로 바꿔 내보냈고, 그래서 DB 가 몇 초 흔들리는
 * 동안 **멀쩡히 존재하는 글**이 삭제된 것처럼 보였다. 자기 글을 수정하려던
 * 사람에게는 글이 사라진 것으로 읽힌다.
 *
 * maybeSingle() 은 행이 0개면 { data: null, error: null } 을 준다. 그래서
 * error 는 오직 진짜 실패고, !data 는 오직 진짜 없음이다 — 둘을 갈라 놓는다. */
export async function getPostSb(id: string): Promise<Post | null> {
  /* posts.id 는 uuid 다. 형식이 안 맞는 id 를 그대로 넘기면 Postgres 가
     22P02(invalid input syntax for type uuid)를 내는데, 그건 장애가 아니라
     "그런 id 는 존재할 수 없다"는 뜻이다. 아래에서 error 를 던지도록 바꿨으니
     이 구분을 안 해 두면 /town/news/mock-1 같은 잘못된 URL 이 404 가 아니라
     500 으로 나간다 — 실제로 scripts/check-links.mjs 가 404 를 기대하는
     경로다. board_posts 쪽(getBoardPost)에 이미 있던 가드와 같은 것이다. */
  if (!UUID_RE.test(id)) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`posts (${id}) 조회 실패: ${error.message ?? "알 수 없는 오류"}`);
  }
  if (!data) return null;
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
  /* 값이 있을 때만 실어 보낸다 — null 을 명시하면 단지 연결이 없다는 뜻이
     행마다 반복되기만 하고, 컬럼 기본값(null)과 결과가 같다. */
  if (post.complexId) row.complex_id = post.complexId;
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
  /* 작성자 신원 — 포인트 추천글 부스트(spend:post_boost_*)와 닉네임 효과가
     이 컬럼으로 "내 글"·작성자 프로필을 찾는다. rowToPost 는 되읽지 않는다(서버 전용). */
  if (post.authorEmail?.trim()) {
    row.author_email = post.authorEmail.trim();
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

/**
 * 댓글 soft-delete. 권한이 없으면 아무것도 하지 않고 `"forbidden"` 을 돌려준다.
 *
 * 저장된 comments JSON 을 **직접** 읽는다 — rowToPost 는 authorEmail 을 응답에 싣지
 * 않으려고 일부러 버리기 때문에, getPostSb 를 거치면 작성자를 판정할 근거가 사라진다.
 */
export async function softDeleteCommentSb(
  postId: string,
  commentId: string,
  actor: CommentDeleteActor,
): Promise<Post | "forbidden" | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data: row, error: readError } = await sb
    .from("posts")
    .select("comments, notify_email")
    .eq("id", postId)
    .maybeSingle();
  if (readError || !row) return null;

  const raw = Array.isArray(row.comments) ? (row.comments as PostComment[]) : [];
  const target = raw.find((c) => String(c.id) === commentId);
  if (!target) return null;
  if (
    !canDeleteComment(target, {
      ...actor,
      postOwnerEmail: row.notify_email ? String(row.notify_email) : null,
    })
  ) {
    return "forbidden";
  }

  const now = new Date().toISOString();
  const comments = raw.map((c) =>
    String(c.id) === commentId
      ? { ...c, body: softDeleteCommentBody(), deletedAt: now }
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
