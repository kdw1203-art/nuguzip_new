import Link from "next/link";
import { Icon } from "@/app/components/Icon";

export type SectionHeaderAction = {
  label: string;
  href: string;
};

export type SectionHeaderProps = {
  title: string;
  icon?: string;
  action?: SectionHeaderAction;
  className?: string;
};

/** Standardized site-wide section header: title (+ optional icon) and an optional "more" link. */
export function SectionHeader({
  title,
  icon,
  action,
  className = "",
}: SectionHeaderProps) {
  const cls = ["flex items-center justify-between gap-3", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <div className="flex min-w-0 items-center gap-1.5">
        {icon && (
          <Icon name={icon} size={18} className="shrink-0 text-primary" />
        )}
        <h2 className="truncate text-[15px] font-extrabold text-ink">
          {title}
        </h2>
      </div>
      {action && (
        <Link
          href={action.href}
          className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-primary no-underline"
        >
          {action.label} ›
        </Link>
      )}
    </div>
  );
}
