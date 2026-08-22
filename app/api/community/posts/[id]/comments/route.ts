import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { safeAuth } from "@/lib/safe-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { notifyPostAuthorOfNewComment } from "@/lib/notifications/comment-notify";
import { appendComment } from "@/lib/posts-store";
import type { PostComment } from "@/lib/types/post";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { awardPoints } from "@/lib/points/ledger";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
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

  const b = body as Record<string, unknown>;
  const text = String(b.body ?? "").trim();
  // posts/route.ts 와 같은 정정 — local part 전체 저장 금지, 마스킹으로 통일
  const authorLabel =
    session.user.name?.trim() ||
    `${session.user.email.split("@")[0]?.slice(0, 2) || "이웃"}** 이웃`;

  if (text.length < 1) {
    return NextResponse.json({ error: "댓글 내용을 입력해 주세요." }, { status: 400 });
  }

  const comment: PostComment = {
    id: crypto.randomUUID(),
    authorLabel,
    // 삭제 권한 판정의 근거. 표시 이름은 사용자가 바꿀 수 있어 신원이 될 수 없다.
    // 서버 전용 필드로, API 응답에는 실리지 않는다(lib/types/post.ts 주석 참고).
    ...(session?.user?.email
      ? { authorEmail: session.user.email.trim().toLowerCase() }
      : {}),
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

  // /town/news/[id] 는 ISR(600s)이다. 재생성 없이는 방금 단 댓글이 최대 10분간
  // 안 보여 "기능이 조용히 죽은" 것처럼 읽힌다 — 쓰기 성공 시 즉시 재생성.
  revalidatePath(`/town/news/${id}`);

  /* [3차] 참여 적립 — 글당 1회(refId), 일 3회 상한은 원장 규칙이 방어한다.
     적립 실패(상한·중복 포함)는 댓글 성공을 바꾸지 않는다(fail-soft). */
  let pointsAwarded = 0;
  try {
    const award = await awardPoints(session.user.email, "comment_written", id);
    if (award.ok) pointsAwarded = award.awarded;
  } catch (e) {
    logger.error("[comment-points]", e);
  }

  return NextResponse.json({ post, comment, pointsAwarded }, { status: 201 });
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
  // 작성자 본인·글쓴이·관리자만 지울 수 있다. 예전에는 로그인만 되어 있으면
  // commentId 만으로 남의 댓글이 지워졌다(commentId 는 공개 응답에 그대로 실린다).
  const post = await softDeleteComment(postId, commentId, {
    email: session.user.email,
    isAdmin: isAdmin(session),
  });
  if (post === "forbidden") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  if (!post) {
    return NextResponse.json({ error: "게시글 또는 댓글을 찾을 수 없습니다." }, { status: 404 });
  }

  void recordFunnelEvent(req, {
    eventName: FUNNEL_EVENT.CONTENT_REPORT_SUBMIT,
    userEmail: session.user.email,
    path: `/api/community/posts/${postId}/comments`,
    metadata: { postId, commentId, action: "soft_delete" },
  });

  revalidatePath(`/town/news/${postId}`); // 댓글 등록과 같은 이유 (ISR 캐시 즉시 재생성)

  return NextResponse.json({ post });
}
