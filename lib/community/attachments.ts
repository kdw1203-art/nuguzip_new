/**
 * [B31] 동네이야기 글의 첨부 사진 — **읽는 쪽**의 단일 소스.
 *
 * 상태: POST /api/community/posts 는 imageUrls 를 받아
 * automation_meta.attachments 에 저장하고 있었는데, 그걸 다시 그리는 코드가
 * 한 줄도 없었다. 게다가 글쓰기 화면에는 사진을 고르는 UI 자체가 없었다 —
 * 쓸 수도 없고 보여 주지도 않는 저장 경로였다.
 *
 * 피드는 사진 우선 격자인데 이야기 글의 cover 가 늘 null 이라, 커뮤니티 글은
 * 무조건 그라디언트 상자로 떨어졌다. 여기서 꺼낸 값이 그 자리를 채운다.
 *
 * 검증을 이 한 곳에 모은 이유: automation_meta 는 jsonb 라 무엇이든 들어올 수
 * 있다. 화면에 그리기 전에 **https 절대주소만** 남긴다 —
 * `javascript:` 나 `data:` 가 <img src> 로 들어가는 경로를 만들지 않는다.
 */
import type { Post } from "@/lib/types/post";

/** 한 글에 붙일 수 있는 사진 수 — 쓰기(API)와 읽기가 같은 값을 쓴다. */
export const MAX_POST_IMAGES = 6;

function isSafeImageUrl(u: string): boolean {
  /* 상대경로(/storage/...)도 허용한다 — 우리 도메인 안이다.
     그 외에는 https 만. http 는 혼합 콘텐츠라 어차피 브라우저가 막는다. */
  if (u.startsWith("/") && !u.startsWith("//")) return true;
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

/** 글에 첨부된 사진 URL 목록. 없거나 형식이 어긋나면 빈 배열. */
export function postAttachments(
  post: Pick<Post, "automationMeta"> | null | undefined,
): string[] {
  const raw = post?.automationMeta?.attachments;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const u = String(v ?? "").trim();
    if (!u || !isSafeImageUrl(u)) continue;
    if (out.includes(u)) continue; // 같은 사진을 두 번 그리지 않는다
    out.push(u);
    if (out.length >= MAX_POST_IMAGES) break;
  }
  return out;
}
