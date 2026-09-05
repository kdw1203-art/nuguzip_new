import type { ReactNode } from "react";

/* [966] 외부 링크 — 새 창으로 열리는 <a> 의 정본. rel 은 항상 noopener noreferrer
   (window.opener 로 되돌아오는 탭 재작성 차단 + 리퍼러 비노출). 화살표는 "여기를
   벗어난다"는 시각 신호, sr-only "(새 창)" 은 같은 말을 스크린리더에 한다.
   아이콘 세트에 외부 링크 모양이 없어 인라인 SVG 로 그린다(currentColor 상속). */
export function ExternalLink({
  href,
  className = "",
  children,
  iconSize = 12,
  hideIcon = false,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  iconSize?: number;
  hideIcon?: boolean;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      {!hideIcon && (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="ml-0.5 inline-block align-[-0.1em]"
        >
          <path d="M7 17 17 7" />
          <path d="M8 7h9v9" />
        </svg>
      )}
      <span className="sr-only"> (새 창)</span>
    </a>
  );
}

export default ExternalLink;
