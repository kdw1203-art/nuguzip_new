import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { Icon } from "@/app/components/Icon";
import { LeadActions } from "./LeadActions";
import { safeAuth } from "@/lib/safe-auth";
import { getExpertStatus } from "@/lib/experts/is-verified";
import {
  listInquiriesForOwner,
  getOwnerInquiryStats,
  type Inquiry,
  type InquiryStatus,
} from "@/lib/listings/inquiries";

/* ============================================================
   받은 문의 — /my/leads (로그인 + 공인중개사 인증 필수)
   관심 구매/임차자가 남긴 문의(리드)를 받아 확인·회신·보관한다. 실데이터.
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "받은 문의 · 누구집",
  robots: { index: false, follow: false },
};

const STATUS_META: Record<InquiryStatus, { label: string; cls: string }> = {
  new: { label: "새 문의", cls: "bg-[rgba(29,79,216,.1)] text-primary" },
  read: { label: "확인함", cls: "bg-[rgba(0,0,0,.06)] text-text-2" },
  replied: { label: "회신함", cls: "bg-[rgba(26,127,78,.1)] text-[#1a7f4e]" },
  archived: { label: "보관", cls: "bg-[rgba(0,0,0,.05)] text-text-3" },
};

/** ISO → "방금 전 / N분 전 / N시간 전 / N일 전 / YYYY.MM.DD" */
function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "방금 전";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default async function MyLeadsPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/my/leads");
  }
  const email = session.user.email;

  const expert = await getExpertStatus(email);
  if (!expert.isBroker) {
    return (
      <PageShell breadcrumb="마이 › 받은 문의" title="받은 문의">
        <div className="mx-auto max-w-[520px]">
          <div className="rise-in card flex flex-col items-center gap-3 px-5 py-12 text-center">
            <div className="text-[26px]">
              <Icon name="✉️" size={26} />
            </div>
            <div className="text-[15px] font-extrabold text-ink">
              받은 문의는 공인중개사 인증 후 이용할 수 있어요
            </div>
            <p className="max-w-[420px] text-[13px] leading-[1.7] text-text-3">
              개업공인중개사 자격을 인증하면 내 매물에 남겨진 문의(리드)를 이 화면에서
              받아 관리할 수 있어요.
            </p>
            <Link href="/town/experts" className="btn-primary btn-md mt-1 no-underline">
              전문가 인증 신청
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const [items, stats] = await Promise.all([
    listInquiriesForOwner(email),
    getOwnerInquiryStats(email),
  ]);

  return (
    <PageShell breadcrumb="마이 › 받은 문의" title="받은 문의">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-3">
          전체 {stats.total} · 새 문의{" "}
          <b className={stats.unread > 0 ? "text-primary" : "text-text-2"}>{stats.unread}</b>
        </p>
        <Link href="/my/listings" className="btn-outline btn-md no-underline">
          내 매물 관리
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rise-in card card-pad-sm flex flex-col items-center gap-3 py-14 text-center">
          <div className="text-[15px] font-extrabold text-ink">아직 받은 문의가 없어요</div>
          <p className="max-w-[440px] text-[13px] leading-[1.7] text-text-3">
            노출 중인 매물에 관심 있는 이용자가 문의를 남기면 여기로 도착해요. 매물 정보와
            사진을 충실히 채우면 문의가 늘어나요.
          </p>
          <Link href="/my/listings" className="btn-primary btn-md no-underline">
            내 매물 보기
          </Link>
        </div>
      ) : (
        <div className="rise-in flex flex-col gap-3">
          {items.map((q: Inquiry) => {
            const meta = STATUS_META[q.status];
            return (
              <div
                key={q.id}
                className={`card card-pad-sm flex flex-col gap-2.5 ${
                  q.status === "new" ? "border-l-[3px] border-l-primary" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-[6px] px-2 py-[3px] text-[11px] font-extrabold ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                  <Link
                    href={`/listings/${q.listingId}`}
                    className="text-[14px] font-extrabold text-ink hover:underline"
                  >
                    {q.complexName ?? "매물"}
                  </Link>
                  {q.regionName && (
                    <span className="text-[12px] text-text-3">· {q.regionName}</span>
                  )}
                  <span className="ml-auto text-[11px] text-text-3">{timeAgo(q.createdAt)}</span>
                </div>

                <p className="whitespace-pre-wrap rounded-xl bg-[rgba(0,0,0,.03)] px-3.5 py-2.5 text-[13px] leading-[1.7] text-text-2">
                  {q.message}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-3">
                  <span>
                    문의자 · <b className="text-text-2">{q.inquirerLabel ?? "이용자"}</b>
                  </span>
                  {q.contact && (
                    <span>
                      회신 연락처 · <b className="text-ink break-all">{q.contact}</b>
                    </span>
                  )}
                </div>

                <div className="mt-0.5">
                  <LeadActions inquiryId={q.id} status={q.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 법적 고지 */}
      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        문의는 이용자가 남긴 정보입니다. 누구집은 광고 매체로서 문의를 전달할 뿐 중개
        당사자가 아니며, 회신·중개 행위는 개업공인중개사가 수행합니다.
      </div>
    </PageShell>
  );
}
