import type { Post, PostComment } from "@/lib/types/post";
import { enqueueEmailNotification } from "@/lib/notifications/outbox";
import { trySendViaResend } from "@/lib/notifications/resend-send";
import { pushInboxNotification } from "@/lib/notifications/inbox";

/**
 * 글 작성자에게 댓글 알림 (notifyComments + notifyEmail).
 * 동일 이메일로 단 댓글은 스킵.
 */
export async function notifyPostAuthorOfNewComment(input: {
  post: Post;
  comment: PostComment;
  commenterEmail?: string;
}): Promise<void> {
  const { post, comment, commenterEmail } = input;
  if (!post.notifyComments) return;
  const to = post.notifyEmail?.trim();
  if (!to) return;
  if (
    commenterEmail &&
    commenterEmail.trim().toLowerCase() === to.toLowerCase()
  ) {
    return;
  }

  const subject = `[우리동네이야기] 새 댓글: ${post.title.slice(0, 60)}`;
  const preview = comment.body.slice(0, 280);
  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  const html = `
    <p><strong>${escapeHtml(comment.authorLabel)}</strong> 님이 댓글을 남겼습니다.</p>
    <blockquote style="border-left:3px solid #3182f6;padding-left:12px;color:#334155">${escapeHtml(preview)}</blockquote>
    <p><a href="${base}/community/${post.id}">글에서 보기</a></p>
  `;

  // 인앱 받은편지함 알림 (Supabase 연동 여부와 관계없이 시도)
  void pushInboxNotification({
    userEmail: to,
    title: "새 댓글이 달렸어요",
    body: `"${post.title.slice(0, 30)}"에 ${comment.authorLabel}님이 댓글을 남겼습니다.`,
    actionUrl: `/community/${post.id}`,
  }).catch(() => {});

  const sent = await trySendViaResend({ to, subject, html });
  if (sent.ok) return;

  await enqueueEmailNotification({
    to,
    subject,
    body: preview,
    metadata: {
      postId: post.id,
      commentId: comment.id,
      html,
      resendError: sent.error,
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
