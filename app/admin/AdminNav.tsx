"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

/* [G004 2026-08-31] 21개 콘솔 평면 나열 → 보는 주기 기준 3그룹.
 *
 * 콘솔이 18줄 한 줄로 서 있으니 "오늘 봐야 하는 것"과 "분기에 한 번 여는 것"이
 * 같은 무게로 보였다 — 매일 열어야 할 신선도·모더레이션이 배너·실험 사이에
 * 묻힌다. 그룹 이름이 곧 운영 리듬이다: 매일 / 주간 / 설정·도구.
 *
 * 모바일(가로 스크롤)에서는 그룹 제목 없이 한 줄 유지 — 접이식은 md 이상에서만.
 * 정적 배지 금지 원칙(실집계 아닌 숫자 금지)은 그대로 유지한다. */
const NAV_GROUPS: Array<{ title: string; items: NavItem[]; defaultOpen: boolean }> = [
  {
    title: "매일",
    defaultOpen: true,
    items: [
      { href: "/admin", label: "대시보드" },
      { href: "/admin/traffic", label: "트래픽" },
      { href: "/admin/freshness", label: "데이터 신선도" },
      { href: "/admin/moderation", label: "신고 · 모더레이션" },
      { href: "/admin/ops", label: "운영 · 공지" },
    ],
  },
  {
    title: "주간",
    defaultOpen: true,
    items: [
      { href: "/admin/revenue", label: "수익" },
      { href: "/admin/payments", label: "결제 연동" },
      { href: "/admin/quality", label: "품질 · 인증" },
      { href: "/admin/seo", label: "SEO 측정" },
      { href: "/admin/data", label: "데이터 · 지오코딩" },
      { href: "/admin/perf", label: "성능" },
    ],
  },
  {
    title: "설정 · 도구",
    defaultOpen: false,
    items: [
      { href: "/admin/banners", label: "배너 · 광고" },
      { href: "/admin/experiments", label: "실험 (A/B)" },
      { href: "/admin/market", label: "마켓 · 정산" },
      { href: "/admin/social", label: "소셜 · 쇼츠" },
      { href: "/admin/blog-pack", label: "블로그 팩" },
      { href: "/admin/community", label: "커뮤니티 운영" },
      { href: "/admin/ai", label: "AI 도구" },
    ],
  },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
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
}

export function AdminNav() {
  const pathname = usePathname();
  const isActive = (item: NavItem) =>
    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);

  return (
    <nav>
      {/* 모바일 — 그룹 없이 한 줄 가로 스크롤 (기존 동작 유지) */}
      <div className="flex flex-row overflow-x-auto md:hidden">
        {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item)} />
        ))}
      </div>
      {/* md+ — 3그룹 접이식. 활성 항목이 든 그룹은 항상 연다(길 잃지 않기). */}
      <div className="hidden md:block">
        {NAV_GROUPS.map((g) => {
          const containsActive = g.items.some(isActive);
          return (
            <details key={g.title} open={g.defaultOpen || containsActive}>
              <summary className="cursor-pointer select-none px-5 pb-1 pt-3 text-[12px] font-extrabold uppercase tracking-[0.12em] !text-[#5f6b7d] hover:!text-[#9aa6b8] [&::-webkit-details-marker]:hidden">
                {g.title}
              </summary>
              <div className="flex flex-col">
                {g.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item)} />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </nav>
  );
}
