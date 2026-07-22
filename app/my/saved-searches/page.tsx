import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import { listSavedSearches } from "@/lib/saved-search/store";
import { SavedSearchClient } from "./SavedSearchClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "저장 검색 | 누구집",
  description: "관심 조건을 저장하고 새 매물이 나오면 알림으로 받아보세요.",
};

export default async function SavedSearchesPage() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;

  if (!email) {
    return (
      <PageShell breadcrumb="홈 › 마이 › 저장 검색" title="저장 검색">
        <div className="card rise-in mx-auto flex max-w-[480px] flex-col items-center gap-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="bell" size={22} />
          </span>
          <div className="flex flex-col gap-1.5">
            <p className="text-[15px] font-extrabold text-ink">
              로그인하고 검색을 저장해 보세요
            </p>
            <p className="text-[13px] leading-[1.6] text-text-2">
              관심 조건을 저장해 두면 새 매물이 나올 때 알림으로 받아볼 수 있어요.
            </p>
          </div>
          <Link
            href="/login"
            className="btn-primary press inline-flex items-center gap-1.5"
          >
            <Icon name="user" size={16} />
            로그인하기
          </Link>
        </div>
      </PageShell>
    );
  }

  const items = await listSavedSearches(email);

  return (
    <PageShell breadcrumb="홈 › 마이 › 저장 검색" title="저장 검색">
      <SavedSearchClient initial={items} />
    </PageShell>
  );
}
