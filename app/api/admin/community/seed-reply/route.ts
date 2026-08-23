import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { safeAuth } from "@/lib/safe-auth";
import { appendComment, getPost } from "@/lib/posts-store";

/* [#121] 시드 답글 — 빈 스레드가 첫 방문자를 돌려세우지 않도록, 관리자만
   공식 라벨("누구집")로 빠른 답글을 단다. 일반 댓글 경로(포인트 적립·알림)와
   분리된 운영 도구이므로 적립은 없다(자가 적립 원천 차단). */

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 전용입니다." }, { status: 403 });
  }
  const session = await safeAuth();
  const body = await req.json().catch(() => ({}));
  const postId = String(body.postId ?? "").trim();
  const text = String(body.text ?? "").trim();
  if (!postId || text.length < 5) {
    return NextResponse.json({ error: "postId 와 5자 이상 본문이 필요합니다." }, { status: 400 });
  }
  const post = await getPost(postId);
  if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });

  const updated = await appendComment(postId, {
    id: randomUUID(),
    authorLabel: "누구집",
    authorEmail: session?.user?.email ?? undefined,
    body: text.slice(0, 2000),
    createdAt: new Date().toISOString(),
  });
  if (!updated) return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  revalidatePath(`/town/news/${postId}`);
  return NextResponse.json({ ok: true, comments: updated.commentCount });
}
