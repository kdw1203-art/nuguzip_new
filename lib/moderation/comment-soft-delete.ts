import type { PostComment } from "@/lib/types/post";

const DELETED_BODY = "[삭제된 댓글입니다]";

export function softDeleteCommentBody(): string {
  return DELETED_BODY;
}

/** 댓글 삭제를 요청한 사람. email 은 로그인 이메일. */
export type CommentDeleteActor = {
  email: string;
  /** 글쓴이 이메일(Post.notifyEmail). 없으면 글쓴이를 특정할 수 없다는 뜻. */
  postOwnerEmail?: string | null;
  isAdmin?: boolean;
};

/**
 * 이 댓글을 지울 수 있는가.
 *
 * 예전에는 softDeleteComment(postId, commentId) 가 **작성자를 전혀 보지 않았다** —
 * 로그인만 되어 있으면 commentId 만으로 남의 댓글을 지울 수 있었다. commentId 는 공개
 * API 응답에 그대로 실려 나가는 값이라 추측할 필요조차 없었다.
 *
 * 허용: 댓글 작성자 본인 · 글쓴이 · 관리자.
 * authorEmail 이 없는 옛 댓글·비로그인 댓글은 작성자 본인 판정이 불가능하므로
 * 글쓴이와 관리자만 지울 수 있다(fail-closed).
 */
export function canDeleteComment(
  comment: Pick<PostComment, "authorEmail">,
  actor: CommentDeleteActor,
): boolean {
  const email = actor.email.trim().toLowerCase();
  if (!email) return false;
  if (actor.isAdmin) return true;
  const owner = actor.postOwnerEmail?.trim().toLowerCase();
  if (owner && owner === email) return true;
  const author = comment.authorEmail?.trim().toLowerCase();
  return Boolean(author && author === email);
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
