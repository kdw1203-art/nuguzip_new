"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/* 이미지 폴백 (#18) — 커버/썸네일 이미지가 없거나(로드 실패 포함) 깨질 때
   브라우저 기본 "깨진 이미지" 아이콘 대신 지정한 폴백(그라디언트·아이콘)을 노출한다.
   SSR 시엔 <img>를 그대로 렌더하고, onError가 발생하면 클라이언트에서 폴백으로 교체. */
type CoverImageProps = {
  src?: string | null;
  alt?: string;
  /** <img>에 적용할 클래스 (absolute inset-0 / block w-full 등 레이아웃은 호출부가 결정) */
  imgClassName?: string;
  /** src가 없거나 로드 실패 시 렌더할 폴백 노드 */
  fallback?: ReactNode;
  /** 정상 로드된 이미지 위에 얹는 상단 스크림 그라디언트 */
  scrim?: boolean;
};

export function CoverImage({
  src,
  alt = "",
  imgClassName = "",
  fallback = null,
  scrim = false,
}: CoverImageProps) {
  const [failed, setFailed] = useState(false);
  const show = Boolean(src) && !failed;

  if (!show) return <>{fallback}</>;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src as string}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className={imgClassName}
      />
      {scrim && (
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />
      )}
    </>
  );
}

export default CoverImage;
