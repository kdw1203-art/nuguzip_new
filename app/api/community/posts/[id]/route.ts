import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { deletePost, getPost, updatePost } from "@/lib/posts-store";
import type { Post } from "@/lib/types/post";

export const runtime = "nodejs";

function isAuthor(post: Post, session: { user?: { email?: string | null; name?: string | null } } | null) {
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return false;
  if (post.notifyEmail && post.notifyEmail.trim().toLowerCase() === email) return true;
  const name = session?.user?.name?.trim();
  if (name && post.authorLabel === name) return true;
  return false;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const post = await getPost(id);
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ post });
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
  const post = await getPost(id);
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }
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
  return NextResponse.json({ post: next });
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
  const post = await getPost(id);
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!isAuthor(post, session) && !isAdmin(session)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const ok = await deletePost(id);
  if (!ok) {
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
