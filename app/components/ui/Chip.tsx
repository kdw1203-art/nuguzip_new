import Link from "next/link";
import type { ReactNode } from "react";

export type ChipTone = "default" | "soft";

/* 2026-07-27 — 다음 필터 바를 만드는 사람을 위해 두 가지 함정을 걷어냈다.
   1) BASE 에 `press`(누르면 눌리는 애니메이션)가 박혀 있어서, href 도 핸들러도 없는
      <span> 칩까지 눌리는 반응을 냈다. 반응하는 것은 동작한다는 뜻으로 읽힌다 —
      이제 press 는 실제로 이동·실행되는 <a>/<button> 에만 붙는다.
   2) `asChild` 는 <button> 을 그려 주면서도 onClick 을 받을 방법이 없어서,
      구조적으로 아무 일도 못 하는 버튼만 만들어 냈다. onClick 프롭으로 교체했다 —
      핸들러를 넘겼을 때만 <button> 이 되므로, 동작 없는 버튼이 나올 수 없다.
      (onClick 을 쓰는 쪽은 "use client" 컴포넌트여야 한다.) */

export type ChipProps = {
  active?: boolean;
  tone?: ChipTone;
  /** 이동할 곳. 주면 <Link> 로 렌더된다. */
  href?: string;
  /**
   * 누를 때 실행할 동작. 주면 <button> 으로 렌더된다.
   * 서버 컴포넌트에서는 함수를 넘길 수 없으므로 호출부가 클라이언트 컴포넌트여야 한다.
   */
  onClick?: () => void;
  className?: string;
  children: ReactNode;
};

const BASE =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold no-underline";

/** 진짜로 눌리는 칩(링크·버튼)에만 붙이는 눌림 피드백 */
const INTERACTIVE = "press";

function toneClass(active: boolean, tone: ChipTone): string {
  if (active) return "chip-active";
  if (tone === "soft") return "chip chip-soft";
  return "chip border border-line bg-surface text-text-1";
}

/**
 * 알약형 칩 — filled(`chip-active`) · soft · 중립.
 *
 * href 를 주면 링크, onClick 을 주면 버튼, 둘 다 없으면 누를 수 없는 라벨(<span>)이다.
 * 마지막 경우에는 눌림 애니메이션도 붙이지 않는다 — 안 움직이는 게 정직하다.
 */
export function Chip({
  active = false,
  tone = "default",
  href,
  onClick,
  className = "",
  children,
}: ChipProps) {
  const interactive = Boolean(href || onClick);
  const cls = [BASE, interactive ? INTERACTIVE : "", toneClass(active, tone), className]
    .filter(Boolean)
    .join(" ");

  if (href) {
    // filled chip as a link — guarantee white text (never rely on text-white for <a>).
    return (
      <Link
        href={href}
        className={cls}
        style={active ? { color: "#fff" } : undefined}
      >
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {children}
      </button>
    );
  }
  return <span className={cls}>{children}</span>;
}

export type ChipRowProps = {
  className?: string;
  children: ReactNode;
};

/** Horizontal scroll container for chips (hidden scrollbar). */
export function ChipRow({ className = "", children }: ChipRowProps) {
  const cls = [
    "flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={cls}>{children}</div>;
}
