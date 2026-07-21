import type { CSSProperties } from "react";

/* 로딩 스켈레톤 (#17)
   globals.css의 `.skeleton`(시머 애니메이션)을 재사용하고 Tailwind로 형태를 합성한다.
   순수 마크업이라 서버 컴포넌트로 그대로 사용 가능("use client" 불필요). */

type SkeletonProps = {
  /** 크기·모서리 등 Tailwind 유틸(예: "h-4 w-1/2 rounded-2xl") */
  className?: string;
  /** 인라인 스타일(막대 높이 등 동적 값) */
  style?: CSSProperties;
};

/** 기본 스켈레톤 블록 — `.skeleton` 시머 + className/style 패스스루 */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return <div aria-hidden className={`skeleton ${className}`} style={style} />;
}

/** 여러 줄 텍스트 스켈레톤 — count(줄 수) · height(줄 높이 유틸) */
export function SkeletonText({
  count = 3,
  height = "h-3",
  className = "",
}: {
  count?: number;
  height?: string;
  className?: string;
}) {
  return (
    <div aria-hidden className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className={`${height} rounded ${i === count - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** 카드 형태 스켈레톤 — 기존 `.card` 룩과 유사 (제목 줄 + 본문 텍스트) */
export function SkeletonCard({
  lines = 2,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`card rounded-2xl p-4 ${className}`}>
      <Skeleton className="h-4 w-1/2 rounded" />
      <SkeletonText count={lines} className="mt-3" />
    </div>
  );
}

/** 카드 리스트 스켈레톤 — count(카드 수) */
export function SkeletonList({
  count = 4,
  lines = 2,
  className = "",
  cardClassName = "",
}: {
  count?: number;
  lines?: number;
  className?: string;
  cardClassName?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} className={cardClassName} />
      ))}
    </div>
  );
}

export default Skeleton;
