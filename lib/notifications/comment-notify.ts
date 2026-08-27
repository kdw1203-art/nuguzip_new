import type { Post, PostComment } from "@/lib/types/post";
import { enqueueEmailNotification } from "@/lib/notifications/outbox";
import { trySendViaResend } from "@/lib/notifications/resend-send";
import { pushInboxNotification } from "@/lib/notifications/inbox";
import { emailLayout } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/news-seo";

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

  const subject = `[누구집] 새 댓글: ${post.title.slice(0, 60)}`;
  const preview = comment.body.slice(0, 280);
  /* [B23] 알림이 **그 글로** 가야 한다.
     예전에는 메일도 인앱 알림도 목적지가 `/town` 이었다 — 댓글 알림을 받고
     피드로 떨어지면 자기 글을 눈으로 찾아야 한다(글이 밀렸으면 못 찾는다).
     글 상세는 /town/news/[id] 다. 댓글 자리까지 앵커로 데려간다.
     base 도 AUTH_URL 미설정 시 http://localhost:3000 이 메일에 그대로 박혔다 —
     운영 도메인 상수를 최종 폴백으로 둔다. */
  const base = process.env.AUTH_URL?.trim() || SITE_URL;
  const postPath = `/town/news/${post.id}`;
  const postUrl = `${base}${postPath}#comments`;
  /* 고도화 49 — 알림 메일도 표준 레이아웃(브랜드 헤더 + 수신거부·사업자 푸터) */
  const html = emailLayout(`
    <p><strong>${escapeHtml(comment.authorLabel)}</strong> 님이 댓글을 남겼습니다.</p>
    <blockquote style="border-left:3px solid #3182f6;padding-left:12px;color:#334155">${escapeHtml(preview)}</blockquote>
    <p><a href="${postUrl}">댓글 보러 가기</a></p>
  `);

  // 인앱 받은편지함 알림 (Supabase 연동 여부와 관계없이 시도)
  void pushInboxNotification({
    userEmail: to,
    title: "새 댓글이 달렸어요",
    body: `"${post.title.slice(0, 30)}"에 ${comment.authorLabel}님이 댓글을 남겼습니다.`,
    actionUrl: `${postPath}#comments`,
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
