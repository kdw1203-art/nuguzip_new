"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  badge?: { text: string; tone: "danger" | "warn" };
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "대시보드" },
  {
    href: "/admin/moderation",
    label: "신고 · 모더레이션",
    badge: { text: "4", tone: "danger" },
  },
  {
    href: "/admin/quality",
    label: "품질 · 인증",
    badge: { text: "2", tone: "warn" },
  },
  { href: "/admin/ops", label: "운영 · 공지" },
  { href: "/admin/market", label: "마켓 · 정산" },
];

function Badge({ text, tone }: { text: string; tone: "danger" | "warn" }) {
  return (
    <span
      className={`ml-1 rounded-full px-[7px] py-px text-[10px] font-extrabold ${
        tone === "danger" ? "bg-danger text-white" : "bg-[#f2c94c] text-[#12161f]"
      }`}
    >
      {text}
    </span>
  );
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-row overflow-x-auto md:flex-col md:overflow-visible">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap px-5 py-[11px] text-[13px] transition-colors ${
              active
                ? "border-b-[3px] border-[#7ea2ff] bg-[rgba(126,162,255,.1)] font-bold !text-[#7ea2ff] md:border-b-0 md:border-l-[3px]"
                : "border-b-[3px] border-transparent font-semibold !text-[#9aa6b8] hover:!text-[#c9d2e0] md:border-b-0 md:border-l-[3px]"
            }`}
          >
            {item.label}
            {item.badge ? <Badge text={item.badge.text} tone={item.badge.tone} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
