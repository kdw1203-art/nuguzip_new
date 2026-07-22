import type { ReactNode } from "react";

export type BadgeTone =
  | "primary"
  | "success"
  | "danger"
  | "warning"
  | "neutral"
  | "example";

const TONES: Record<BadgeTone, string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  neutral: "bg-[rgba(127,140,158,.12)] text-text-3",
  example: "bg-[rgba(127,140,158,.12)] text-text-3",
};

export type BadgeProps = {
  tone?: BadgeTone;
  children?: ReactNode;
};

/** Small status pill. `example` tone defaults its label to "예시". */
export function Badge({ tone = "neutral", children }: BadgeProps) {
  const content =
    tone === "example" && (children === undefined || children === null)
      ? "예시"
      : children;
  const cls = [
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
    TONES[tone],
  ].join(" ");
  return <span className={cls}>{content}</span>;
}
