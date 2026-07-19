import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { getBusinessInfo } from "@/lib/brand/business-info";

const NAV_ITEMS = [
  { href: "/legal/terms", label: "이용약관" },
  { href: "/legal/privacy", label: "개인정보처리방침" },
  { href: "/legal/expert", label: "전문가 운영정책" },
  { href: "/legal/community", label: "커뮤니티 운영정책" },
  { href: "/legal/fees", label: "거래·수수료" },
  { href: "/legal/location", label: "위치기반서비스 이용약관" },
  { href: "/legal/youth", label: "청소년 보호방침" },
  { href: "/legal/privacy-request", label: "개인정보 열람·정정·삭제" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const info = getBusinessInfo();
  return (
    <PageShell breadcrumb="홈 › 법적 고지">
      <div className="mx-auto flex w-full max-w-5xl gap-8">
        {/* 사이드 네비 */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-3">
            법적 고지
          </p>
          <nav className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-[10px] px-3 py-2 text-sm text-text-2 hover:bg-primary-soft hover:text-ink"
              >
                {item.label}
                <span aria-hidden className="text-text-3">
                  ›
                </span>
              </Link>
            ))}
          </nav>
          <div className="mt-8 rounded-[14px] bg-surface p-3 text-[11px] leading-relaxed text-text-3 border border-line">
            <p className="font-semibold text-text-1">법적 고지 관련 문의</p>
            <p className="mt-1">개인정보보호책임자</p>
            <p>이메일: {info.privacyEmail}</p>
          </div>
        </aside>

        {/* 본문 */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PageShell>
  );
}
