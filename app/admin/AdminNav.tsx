"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

// 정적 배지(수익 9 · 신고 4 · 품질 2)는 실집계가 아닌 하드코딩 값이라 제거했다.
// 실시간 대기 건수는 각 페이지(대시보드/모더레이션 등)의 실데이터 패널에서 노출한다.
const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/traffic", label: "트래픽" },
  { href: "/admin/revenue", label: "수익" },
  { href: "/admin/payments", label: "결제 연동" },
  { href: "/admin/moderation", label: "신고 · 모더레이션" },
  { href: "/admin/quality", label: "품질 · 인증" },
  { href: "/admin/experiments", label: "실험 (A/B)" },
  { href: "/admin/ops", label: "운영 · 공지" },
  { href: "/admin/market", label: "마켓 · 정산" },
  { href: "/admin/banners", label: "배너 · 광고" },
  { href: "/admin/data", label: "데이터 · 지오코딩" },
  { href: "/admin/seo", label: "SEO 측정" },
];

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
                ? "border-b-[3px] border-ai-accent bg-[rgba(126,162,255,.1)] font-bold !text-ai-accent md:border-b-0 md:border-l-[3px]"
                : "border-b-[3px] border-transparent font-semibold !text-[#9aa6b8] hover:!text-[#c9d2e0] md:border-b-0 md:border-l-[3px]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
