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
  readPostsSb,
  softDeleteCommentSb,
  togglePostLikeSb,
  updatePostSb,
  userHasLikedSb,
} from "@/lib/posts-store-supabase";
import type { Post, PostComment } from "@/lib/types/post";

function storageBackendIsSupabase() {
  return isSupabaseConfigured();
}

export async function readPosts(): Promise<Post[]> {
  return storageBackendIsSupabase() ? readPostsSb() : readPostsFile();
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
