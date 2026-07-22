import type { ReactNode } from "react";

export type BadgeTone =
  | "primary"
  | "success"
  | "danger"
  | "warning"
  | "neutral";

const TONES: Record<BadgeTone, string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  neutral: "bg-[rgba(127,140,158,.12)] text-text-3",
};

export type BadgeProps = {
  tone?: BadgeTone;
  children?: ReactNode;
};

/**
 * Small status pill. NOTE: the "예시"(sample-data) label is intentionally NOT a
 * Badge tone — it has a single canonical implementation in
 * `@/app/components/ExampleBadge`. Use that for sample-data labels so the look
 * stays unified site-wide.
 */
export function Badge({ tone = "neutral", children }: BadgeProps) {
  const cls = [
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
    TONES[tone],
  ].join(" ");
  return <span className={cls}>{children}</span>;
}
