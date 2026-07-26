import { isSupabaseConfigured } from "@/lib/supabase/flags";
import {
  appendCommentFile,
  deletePostFile,
  getPostFile,
  incrementViewCountFile,
  prependPostFile,
  readPostsFile,
  softDeleteCommentFile,
  togglePostLikeFile,
  updatePostFile,
  userHasLikedFile,
} from "@/lib/posts-store-file";
import {
  appendCommentSb,
  deletePostSb,
  getPostSb,
  incrementViewCountSb,
  prependPostSb,
  POSTS_READ_LIMIT,
  readPostsSb,
  softDeleteCommentSb,
  togglePostLikeSb,
  updatePostSb,
  userHasLikedSb,
} from "@/lib/posts-store-supabase";
import type { Post, PostComment } from "@/lib/types/post";

export { POSTS_READ_LIMIT };

function storageBackendIsSupabase() {
  return isSupabaseConfigured();
}

/**
 * 최신순 글 목록. **전부가 아니라 최신 `limit` 건**이다(기본
 * {@link POSTS_READ_LIMIT}). 총계·비율처럼 전수가 필요한 값은 이 목록의
 * length 로 세면 안 된다 — 상한에 걸리면 조용히 틀린 수를 내놓는다.
 * 그런 곳은 count 질의를 쓴다.
 */
export async function readPosts(
  limit: number = POSTS_READ_LIMIT,
): Promise<Post[]> {
  if (storageBackendIsSupabase()) return readPostsSb(limit);
  /* 파일 백엔드는 애초에 전량을 메모리에 올리므로 상한이 부하 문제는 아니지만,
     두 백엔드가 같은 개수를 돌려주도록 여기서도 똑같이 자른다. */
  return (await readPostsFile()).slice(0, Math.max(1, limit));
}

export async function prependPost(post: Post): Promise<void> {
  if (storageBackendIsSupabase()) {
    await prependPostSb(post);
    return;
  }
  await prependPostFile(post);
}

export async function getPost(id: string): Promise<Post | null> {
  return storageBackendIsSupabase() ? getPostSb(id) : getPostFile(id);
}

export async function incrementViewCount(id: string): Promise<Post | null> {
  return storageBackendIsSupabase()
    ? incrementViewCountSb(id)
    : incrementViewCountFile(id);
}

export async function appendComment(
  id: string,
  comment: PostComment,
): Promise<Post | null> {
  return storageBackendIsSupabase()
    ? appendCommentSb(id, comment)
    : appendCommentFile(id, comment);
}

export async function softDeleteComment(
  postId: string,
  commentId: string,
): Promise<Post | null> {
  return storageBackendIsSupabase()
    ? softDeleteCommentSb(postId, commentId)
    : softDeleteCommentFile(postId, commentId);
}

export async function togglePostLike(
  postId: string,
  userKey: string,
): Promise<{ liked: boolean; likeCount: number } | null> {
  return storageBackendIsSupabase()
    ? togglePostLikeSb(postId, userKey)
    : togglePostLikeFile(postId, userKey);
}

export async function updatePost(
  id: string,
  patch: Partial<Post>,
): Promise<Post | null> {
  return storageBackendIsSupabase()
    ? updatePostSb(id, patch)
    : updatePostFile(id, patch);
}

export async function deletePost(id: string): Promise<boolean> {
  return storageBackendIsSupabase() ? deletePostSb(id) : deletePostFile(id);
}

export async function userHasLikedPost(
  postId: string,
  userKey: string,
): Promise<boolean> {
  if (!userKey) return false;
  return storageBackendIsSupabase()
    ? userHasLikedSb(postId, userKey)
    : userHasLikedFile(postId, userKey);
}
