import Link from "next/link";
import type { ReactNode } from "react";

export type ChipTone = "default" | "soft";

export type ChipProps = {
  active?: boolean;
  tone?: ChipTone;
  /** When true (and no href), renders an interactive <button> instead of a presentational <span>. */
  asChild?: boolean;
  href?: string;
  className?: string;
  children: ReactNode;
};

const BASE =
  "press inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold no-underline";

function toneClass(active: boolean, tone: ChipTone): string {
  if (active) return "chip-active";
  if (tone === "soft") return "chip chip-soft";
  return "chip border border-line bg-surface text-text-1";
}

/** Presentational pill — filled (`chip-active`), soft, or neutral. */
export function Chip({
  active = false,
  tone = "default",
  asChild = false,
  href,
  className = "",
  children,
}: ChipProps) {
  const cls = [BASE, toneClass(active, tone), className]
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
  if (asChild) {
    return (
      <button type="button" className={cls}>
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
