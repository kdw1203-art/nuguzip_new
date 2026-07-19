import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { notifyPostAuthorOfNewComment } from "@/lib/notifications/comment-notify";
import { appendComment } from "@/lib/posts-store";
import type { PostComment } from "@/lib/types/post";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await safeAuth();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const text = String(b.body ?? "").trim();
  const fromClient = String(b.authorLabel ?? "").trim();
  const authorLabel = session?.user
    ? (session.user.name?.trim() ||
        session.user.email?.split("@")[0]?.trim() ||
        "회원")
    : fromClient || "익명";

  if (text.length < 1) {
    return NextResponse.json({ error: "댓글 내용을 입력해 주세요." }, { status: 400 });
  }

  const comment: PostComment = {
    id: crypto.randomUUID(),
    authorLabel,
    body: text,
    createdAt: new Date().toISOString(),
  };

  const post = await appendComment(id, comment);
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }

  void notifyPostAuthorOfNewComment({
    post,
    comment,
    commenterEmail: session?.user?.email ?? undefined,
  }).catch((e) => logger.error("[comment-notify]", e));

  if (session?.user?.email) {
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.COMMUNITY_COMMENT_ADD,
      userEmail: session.user.email,
      path: `/api/community/posts/${id}/comments`,
      metadata: { postId: id, commentId: comment.id },
    });
  }

  return NextResponse.json({ post, comment }, { status: 201 });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await ctx.params;
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const commentId = String((body as Record<string, unknown>).commentId ?? "").trim();
  if (!commentId) {
    return NextResponse.json({ error: "commentId가 필요합니다." }, { status: 400 });
  }

  const { softDeleteComment } = await import("@/lib/posts-store");
  const post = await softDeleteComment(postId, commentId);
  if (!post) {
    return NextResponse.json({ error: "게시글 또는 댓글을 찾을 수 없습니다." }, { status: 404 });
  }

  void recordFunnelEvent(req, {
    eventName: FUNNEL_EVENT.CONTENT_REPORT_SUBMIT,
    userEmail: session.user.email,
    path: `/api/community/posts/${postId}/comments`,
    metadata: { postId, commentId, action: "soft_delete" },
  });

  return NextResponse.json({ post });
}
