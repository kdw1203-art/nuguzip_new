/**
 * 푸터·헤더(모바ile) 공통 서비스 바로가기 — [`categories.ts`](./categories.ts) 5카테고리 대표.
 */

import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Home,
  Map,
  MessageSquare,
  UserRound,
  Users,
} from "lucide-react";
import { FOOTER_CATEGORY_LINKS } from "@/lib/navigation/categories";

export type ServiceShortcutLink = {
  href: string;
  label: string;
  Icon: LucideIcon;
  match: (pathname: string) => boolean;
};

const ICON_BY_KEY: Record<string, LucideIcon> = {
  "imjang-ai": ClipboardList,
  region: Map,
  community: MessageSquare,
  gwangjang: Users,
};

function categoryKeyFromHref(href: string): string {
  if (href.includes("inspection")) return "imjang-ai";
  if (href.includes("explore")) return "region";
  if (href.includes("community")) return "community";
  return "gwangjang";
}

export const SERVICE_SHORTCUT_LINKS: ServiceShortcutLink[] = [
  { href: "/", label: "홈", Icon: Home, match: (p) => p === "/" },
  ...FOOTER_CATEGORY_LINKS.map((c) => {
    const key = categoryKeyFromHref(c.href);
    return {
      href: c.href,
      label: c.label,
      Icon: ICON_BY_KEY[key] ?? Users,
      match: c.match,
    };
  }),
  {
    href: "/me",
    label: "마이",
    Icon: UserRound,
    match: (p) =>
      p === "/me" ||
      p.startsWith("/me/") ||
      p === "/notifications" ||
      p === "/settings",
  },
];
