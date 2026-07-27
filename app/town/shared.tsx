/* 동네이야기(피드·뉴스·자료) 공용 UI 헬퍼 — 서버/클라이언트 컴포넌트 양쪽에서 import.
   server-only 의존이 없어 "use client" 파일에서도 안전하게 쓸 수 있다. */

import type { Post } from "@/lib/types/post";

/* 지역/출처 문자열을 시드로 결정적 그라디언트를 고른다(사진 없는 카드의 커버 폴백). */
const GRADIENTS = [
  "linear-gradient(135deg,#dfe7f5,#c9d6ef)",
  "linear-gradient(135deg,#e7f0e8,#cfe3d4)",
  "linear-gradient(135deg,#f5e9df,#efd9c9)",
  "linear-gradient(135deg,#e9e2f5,#d7c9ef)",
  "linear-gradient(135deg,#dff0f3,#c9e6ef)",
  "linear-gradient(135deg,#f5dfe5,#efc9d6)",
];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** 시드(지역·출처·id)로 결정적 커버 그라디언트 CSS 문자열 */
export function seedGradient(seed: string): string {
  return GRADIENTS[hash(seed || "n") % GRADIENTS.length];
}

/** 사진 없는 커버의 세로 높이(px) — 매소너리가 자연스럽게 보이도록 시드로 변주 */
const COVER_HEIGHTS = [150, 118, 182, 140, 168, 108];
export function seedCoverHeight(seed: string): number {
  return COVER_HEIGHTS[hash(seed || "n") % COVER_HEIGHTS.length];
}

/* 뉴스 썸네일 후보 키 — 자동수집 automation_meta(jsonb)에 아래 키로 이미지 URL이
   실려오면 실이미지 커버로 사용한다. Post 타입에는 전용 이미지 필드가 없어,
   PostAutomationMeta 의 unknown 값을 string 으로 타입 안전하게 좁힌다(any·단언 없음).

   여기(공용 헬퍼)로 올린 이유: 목록(/town/news)에만 있던 함수라 상세
   (/town/news/[id])는 같은 데이터를 두고도 "원문 기사 사진 — 지역" 이라고 적힌
   회색 상자를 그리고 있었다. 목록에서는 실사진이 보이는데 눌러 들어가면
   자리표시자가 나오는, 같은 글에 대한 서로 다른 화면이었다. */
const IMAGE_META_KEYS = [
  "ogImage",
  "og_image",
  "image",
  "imageUrl",
  "image_url",
  "thumbnail",
  "thumbnailUrl",
  "cover",
  "coverImage",
] as const;

/** automation_meta 에서 유효한 http(s) 이미지 URL을 찾으면 반환, 없으면 null */
export function newsImageUrl(post: Post): string | null {
  const meta = post.automationMeta;
  if (!meta) return null;
  for (const key of IMAGE_META_KEYS) {
    const value = meta[key];
    if (typeof value === "string" && /^https?:\/\//.test(value.trim())) {
      return value.trim();
    }
  }
  return null;
}

/** 뉴스 출처 URL → 파비콘 썸네일 URL (출처 로고 표시용) */
export function faviconUrl(url?: string | null): string | null {
  const host = hostOf(url);
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null;
}

/** URL → 표시용 호스트(www. 제거) */
export function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** ISO 시각 → 상대 시간(방금 전·N분 전·N시간 전·N일 전·날짜) */
export function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(t).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

/** 공개 임장노트 작성자 마스킹(이메일 비노출) */
export function maskNoteAuthor(
  label: string | null | undefined,
  email: string,
): string {
  if (label && label.trim()) return label.trim();
  const local = email.split("@")[0] ?? "이웃";
  return `${local.slice(0, 2) || "이웃"}** 이웃`;
}
