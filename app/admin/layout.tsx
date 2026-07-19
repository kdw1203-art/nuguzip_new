import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { canAccessAdminConsole } from "@/lib/auth/staff-roles";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = {
  title: "관리자 콘솔 · 누구집",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 관리자 접근 제어 (구 코드베이스 staff-roles 재사용) — 12o RBAC
  const session = await safeAuth();
  if (!session) {
    redirect("/login?callbackUrl=/admin");
  }
  if (!canAccessAdminConsole(session)) {
    redirect("/");
  }
  return (
    <div className="flex min-h-screen flex-col bg-[#12161f] md:flex-row">
      {/* 사이드바 (모바일: 상단 바) */}
      <aside className="flex flex-shrink-0 flex-col border-b border-[rgba(255,255,255,.07)] py-5 md:min-h-screen md:w-[220px] md:border-b-0 md:border-r">
        <Link
          href="/admin"
          className="flex items-center gap-[7px] px-5 pb-[18px]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2.6 L22 10.4 V20 a1.4 1.4 0 0 1 -1.4 1.4 H14.8 V14.6 H9.2 V21.4 H3.4 A1.4 1.4 0 0 1 2 20 V10.4 Z"
              fill="#7ea2ff"
            />
          </svg>
          <span className="text-[15px] font-extrabold !text-white">
            누구집 Admin
          </span>
        </Link>
        <AdminNav />
        <div className="mt-auto hidden px-5 pt-6 text-[11px] text-[#9aa6b8] md:block">
          <Link href="/" className="!text-[#9aa6b8] hover:!text-[#c9d2e0]">
            ← 서비스로 돌아가기
          </Link>
        </div>
      </aside>

      {/* 본문 */}
      <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
