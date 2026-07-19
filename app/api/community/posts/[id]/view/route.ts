import { NextResponse } from "next/server";
import { incrementViewCount } from "@/lib/posts-store";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const post = await incrementViewCount(id);
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ viewCount: post.viewCount });
}
