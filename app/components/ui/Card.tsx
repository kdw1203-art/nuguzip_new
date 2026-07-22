import type { HTMLAttributes, ReactNode } from "react";

export type CardPadding = "card" | "compact" | "none";

const PADDING: Record<CardPadding, string> = {
  card: "p-[var(--pad-card)]",
  compact: "p-[var(--pad-compact)]",
  none: "",
};

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
  padding?: CardPadding;
  children: ReactNode;
};

/** Surface card wrapper — reuses the design-system `.card` (+ `.card-hover`). */
export function Card({
  hover = false,
  padding = "card",
  className = "",
  children,
  ...rest
}: CardProps) {
  const cls = ["card", hover && "card-hover press", PADDING[padding], className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}

export type CardSectionProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/** Vertical subsection inside a Card — spacing between stacked blocks. */
export function CardSection({
  className = "",
  children,
  ...rest
}: CardSectionProps) {
  const cls = ["mb-4 last:mb-0", className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
