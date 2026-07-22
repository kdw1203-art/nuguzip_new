import { Icon } from "@/app/components/Icon";
import { Button } from "./Button";

export type EmptyStateAction = {
  label: string;
  href: string;
};

export type EmptyStateProps = {
  icon?: string;
  title: string;
  desc?: string;
  action?: EmptyStateAction;
};

/** Centered empty/placeholder block inside a card. */
export function EmptyState({ icon, title, desc, action }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center gap-2 p-[var(--pad-card)] text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name={icon} size={22} />
        </div>
      )}
      <p className="text-[14px] font-bold text-ink">{title}</p>
      {desc && <p className="text-[12px] leading-[1.6] text-text-3">{desc}</p>}
      {action && (
        <Button href={action.href} variant="primary" size="sm" className="mt-1">
          {action.label}
        </Button>
      )}
    </div>
  );
}
