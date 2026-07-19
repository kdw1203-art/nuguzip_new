import type { Post } from "@/lib/types/post";

/** 기획안: score = like*3 + comment*2 + view*0.1 (최근 7일) */
export function popularScore(post: Post): number {
  return (
    post.likeCount * 3 + post.commentCount * 2 + post.viewCount * 0.1
  );
}

export function isWithinDays(post: Post, days: number): boolean {
  const t = new Date(post.createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return t >= cutoff;
}

export function popularPostsLastDays(posts: Post[], days: number, limit: number) {
  return [...posts]
    .filter((p) => isWithinDays(p, days))
    .sort((a, b) => popularScore(b) - popularScore(a))
    .slice(0, limit);
}
