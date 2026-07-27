import { NextResponse } from "next/server";
import { getPost } from "@/lib/posts-store";
import type { Post } from "@/lib/types/post";
import { logger } from "@/lib/log";

/**
 * 커뮤니티 글 단건 조회 결과 — **없음과 못 읽음을 갈라 놓는다.**
 *
 * 왜 필요한가(2026-07-27):
 *   getPost 가 실패도 null 로 돌려주던 시절, /api/community/posts/[id] 의
 *   GET·PATCH·DELETE 와 .../like 는 그 null 을 전부
 *   404 "게시글을 찾을 수 없습니다." 로 바꿔 내보냈다. DB 가 몇 초 흔들리면
 *   자기 글을 수정하려던 사람 화면에 "그런 글 없음"이 뜬다 — 글이 삭제된 줄
 *   알게 되는 응답이다. 조회 실패는 데이터 없음이 아니다.
 *
 *   이제 getPost 는 진짜 없을 때만 null 을 주고 실패는 던진다. 여기서 그
 *   두 갈래를 받아 각각 404 와 503 으로 내보낸다. 503 + Retry-After 는
 *   "지금은 못 준다, 다시 와라"라서 정직하고, 클라이언트도 재시도할 수 있다.
 */
export type PostLookup =
  | { state: "ok"; post: Post }
  | { state: "missing" }
  | { state: "unavailable" };

export async function lookupPost(id: string): Promise<PostLookup> {
  try {
    const post = await getPost(id);
    return post ? { state: "ok", post } : { state: "missing" };
  } catch (e) {
    logger.error(`[community/posts] ${id} 조회 실패`, e);
    return { state: "unavailable" };
  }
}

/** missing/unavailable 을 그대로 응답으로 바꾼다 — 호출부에서 분기 한 줄로 끝난다. */
export function postLookupErrorResponse(
  lookup: Exclude<PostLookup, { state: "ok" }>,
  missingMessage = "게시글을 찾을 수 없습니다.",
): NextResponse {
  if (lookup.state === "missing") {
    return NextResponse.json({ error: missingMessage }, { status: 404 });
  }
  return NextResponse.json(
    { error: "지금은 게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
    { status: 503, headers: { "Retry-After": "10" } },
  );
}
