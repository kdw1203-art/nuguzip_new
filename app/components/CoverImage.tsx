"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/* 이미지 폴백 (#18) — 커버/썸네일 이미지가 없거나(로드 실패 포함) 깨질 때
   브라우저 기본 "깨진 이미지" 아이콘 대신 지정한 폴백(그라디언트·아이콘)을 노출한다.
   SSR 시엔 <img loading="lazy" decoding="async">를 그대로 렌더하고, onError가 발생하면 클라이언트에서 폴백으로 교체.

   [#93, 2026-08-23] 표시단 srcset 도입 — 예전 주석(#25)은 "리사이즈 변환
   엔드포인트가 없어 srcSet 을 만들 소스가 없다"고 판단했는데, Vercel 이미지
   최적화(/_next/image)가 정확히 그 엔드포인트다(next.config images.remotePatterns
   에 이미 우리 Supabase 호스트·pstatic 이 잠겨 있다). next/image 컴포넌트로
   갈아타면 fill/width 계약 때문에 호출부 레이아웃(absolute/block 혼재)이 전부
   흔들리므로, <img> 는 그대로 두고 srcSet 만 /_next/image 변환 URL 로 손수 만든다
   — 렌더 결과 DOM 구조·클래스는 이전과 동일(시각 회귀 0), 전송만 AVIF/WebP
   반응형으로 줄어든다. 허용 호스트가 아니면 원본 단일 src 로 그대로 폴백.
   최적화 경로가 죽으면(onError 1회) 원본으로 재시도, 그것도 죽으면 폴백 노드. */

type CoverImageProps = {
  src?: string | null;
  alt?: string;
  /** <img loading="lazy" decoding="async">에 적용할 클래스 (absolute inset-0 / block w-full 등 레이아웃은 호출부가 결정) */
  imgClassName?: string;
  /** src가 없거나 로드 실패 시 렌더할 폴백 노드 */
  fallback?: ReactNode;
  /** 정상 로드된 이미지 위에 얹는 상단 스크림 그라디언트 */
  scrim?: boolean;
  /** srcset 선택 힌트 — 그리드 카드 기본값. 넓은 히어로는 호출부가 넓게 준다 */
  sizes?: string;
};

/* next.config images.remotePatterns 와 같은 판정만 통과시킨다 — 허용 밖 URL 을
   /_next/image 로 보내면 400 이라, 여기서 거르는 편이 한 번에 그려진다. */
const OPTIMIZABLE = /^https:\/\/([a-z0-9-]+\.supabase\.co|[a-z0-9.-]+\.pstatic\.net)\//;

/** Next 기본 허용 폭(deviceSizes∪imageSizes)의 부분집합만 쓴다 */
const WIDTHS = [384, 640, 828, 1080] as const;

function optimizedSrcSet(src: string): string {
  return WIDTHS.map(
    (w) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75 ${w}w`,
  ).join(", ");
}

export function CoverImage({
  src,
  alt = "",
  imgClassName = "",
  fallback = null,
  scrim = false,
  sizes = "(max-width: 768px) 50vw, 33vw",
}: CoverImageProps) {
  /* ok → (최적화 실패 시) raw → (원본도 실패 시) fallback */
  const [state, setState] = useState<"ok" | "raw" | "failed">("ok");
  const canOptimize = Boolean(src) && OPTIMIZABLE.test(src as string);
  const show = Boolean(src) && state !== "failed";

  if (!show) return <>{fallback}</>;

  const useOptimized = canOptimize && state === "ok";

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src as string}
        {...(useOptimized ? { srcSet: optimizedSrcSet(src as string), sizes } : {})}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setState((s) => (s === "ok" && canOptimize ? "raw" : "failed"))}
        className={imgClassName}
      />
      {scrim && (
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />
      )}
    </>
  );
}

export default CoverImage;
