import type { ReactNode } from "react";
import { Icon } from "@/app/components/Icon";
import { TOWN_CATEGORY_LINKS } from "@/lib/town/category-links";

/* [959] 동네이야기 하위 페이지 머리 — 한 모양.
   개편 전에는 다섯 가지가 섞여 있었다(히어로 띠 / 네이비 카드 / PageShell title /
   맨 h1 / sr-only h1). 카테고리 줄 아래에 **아이콘 칩 + 제목 + 한 줄 + 오른쪽 액션**
   한 줄로 통일한다. 아이콘·색은 카테고리 목록(단일 소스)에서 가져오므로 카드에서
   본 색이 페이지에서 이어진다. */
export function TownPageHead({
  href,
  title,
  sub,
  action,
  className = "",
}: {
  /** 카테고리 목록의 href — 아이콘·색을 여기서 찾는다 */
  href: string;
  title: string;
  sub?: string;
  action?: ReactNode;
  className?: string;
}) {
  const link = TOWN_CATEGORY_LINKS.find((l) => l.href === href);
  return (
    <div className={`rise-in mb-4 flex items-start justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {link && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${link.tone}`}
            aria-hidden="true"
          >
            <Icon name={link.icon} size={20} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="t-title text-ink">{title}</h1>
          {sub && <p className="mt-0.5 t-sub text-text-2">{sub}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
