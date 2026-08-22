import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { deletePost, updatePost } from "@/lib/posts-store";
import { lookupPost, postLookupErrorResponse } from "@/lib/community/post-lookup";
import type { Post } from "@/lib/types/post";

export const runtime = "nodejs";

/**
 * 작성자 판정은 **이메일로만** 한다.
 *
 * 예전에는 `post.authorLabel === session.user.name` 도 작성자로 쳤다. 표시 이름은
 * 사용자가 직접 고르는 값이고 유일하지도 않아서, 남의 글에 적힌 이름으로 프로필을
 * 바꾸기만 하면 그 글의 수정·삭제 권한을 그대로 가져올 수 있었다. 이름은 신원이 아니다.
 */
function isAuthor(post: Post, session: { user?: { email?: string | null } } | null) {
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return false;
  return Boolean(post.notifyEmail && post.notifyEmail.trim().toLowerCase() === email);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const found = await lookupPost(id);
  if (found.state !== "ok") return postLookupErrorResponse(found);
  const post = found.post;
  /* notifyEmail·authorEmail 은 서버 전용 — 익명 응답에서 벗긴다(목록 GET 과 동일 판단). */
  const { notifyEmail: _drop, authorEmail: _drop2, ...publicPost } = post;
  return NextResponse.json({ post: publicPost });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const found = await lookupPost(id);
  if (found.state !== "ok") return postLookupErrorResponse(found);
  const post = found.post;
  if (!isAuthor(post, session) && !isAdmin(session)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const patch: Partial<Post> = {};
  if (b.title !== undefined) patch.title = String(b.title).trim();
  if (b.body !== undefined) patch.body = String(b.body).trim();
  if (b.category !== undefined) patch.category = String(b.category).trim();
  if (b.city !== undefined) patch.city = String(b.city).trim();
  if (b.district !== undefined) patch.district = String(b.district).trim();
  if (Array.isArray(b.tags)) patch.tags = b.tags.map((t) => String(t).trim()).filter(Boolean);
  if (b.ugcPostType !== undefined) {
    const u = String(b.ugcPostType).trim();
    if (u === "question" || u === "review" || u === "tip" || u === "general") {
      patch.ugcPostType = u;
    }
  }
  const next = await updatePost(id, patch);
  if (!next) {
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
  /* 서버 전용 값 제거 — GET 과 같은 규칙(작성자 본인 응답이라도 굳이 싣지 않는다) */
  const { notifyEmail: _n, authorEmail: _a, ...publicNext } = next;
  return NextResponse.json({ post: publicNext });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const found = await lookupPost(id);
  if (found.state !== "ok") return postLookupErrorResponse(found);
  const post = found.post;
  if (!isAuthor(post, session) && !isAdmin(session)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const ok = await deletePost(id);
  if (!ok) {
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
