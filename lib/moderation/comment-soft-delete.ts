import type { PostComment } from "@/lib/types/post";

const DELETED_BODY = "[삭제된 댓글입니다]";

export function softDeleteCommentBody(): string {
  return DELETED_BODY;
}

export function isCommentSoftDeleted(comment: PostComment & { deletedAt?: string | null }): boolean {
  return Boolean(comment.deletedAt) || comment.body === DELETED_BODY;
}

/** 공개 API 응답용 — soft-deleted 댓글은 본문 마스킹 */
export function maskDeletedComments(
  comments: (PostComment & { deletedAt?: string | null })[],
): PostComment[] {
  return comments.map((c) =>
    isCommentSoftDeleted(c)
      ? {
          ...c,
          authorLabel: "익명",
          body: DELETED_BODY,
        }
      : c,
  );
}
