import { popularPostsLastDays } from "@/lib/post-popular";
import { readPosts } from "@/lib/posts-store";
import type { Post } from "@/lib/types/post";
import { logger } from "@/lib/log";

export async function safeReadPosts(): Promise<Post[]> {
  try {
    return await readPosts();
  } catch (e) {
    logger.error("[safeReadPosts]", e);
    return [];
  }
}

/** 홈·지도 등에서 DB/파일 오류 시에도 페이지 전체가 죽지 않도록 */
export async function safePostsForHome(): Promise<{
  posts: Post[];
  popular: Post[];
}> {
  const posts = await safeReadPosts();
  const popular = popularPostsLastDays(posts, 7, 10);
  return { posts, popular };
}
