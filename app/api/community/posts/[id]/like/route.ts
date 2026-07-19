import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getPost, togglePostLike } from "@/lib/posts-store";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await ctx.params;
  const post = await getPost(postId);
  if (!post) {
    return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  let guestId = "";
  try {
    const b = (await req.json()) as { guestId?: string };
    guestId = String(b?.guestId ?? "").trim();
  } catch {
    /* empty body ok */
  }

  const session = await safeAuth();
  const userKey = session?.user?.email?.trim()
    ? `user:${session.user.email.trim()}`
    : guestId
      ? `guest:${guestId}`
      : "";

  if (!userKey) {
    return NextResponse.json(
      {
        error:
          "로그인하거나, 비로그인 시 브라우저에 저장된 guestId가 필요합니다.",
      },
      { status: 401 },
    );
  }

  const result = await togglePostLike(postId, userKey);
  if (!result) {
    return NextResponse.json(
      { error: "공감 처리에 실패했습니다. Supabase에 post_likes 테이블이 있는지 확인하세요." },
      { status: 503 },
    );
  }

  return NextResponse.json(result);
}
