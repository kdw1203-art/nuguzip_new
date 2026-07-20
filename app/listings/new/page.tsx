import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { getExpertStatus } from "@/lib/experts/is-verified";
import { PageShell } from "../../components/PageShell";
import { ListingForm } from "./ListingForm";

/* ============================================================
   매물 직접 등록 — /listings/new (로그인 필수)
   집주인 직접 / 중개사 등록 → status=pending → 어드민 검수 후 노출.
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "매물 등록 · 누구집",
  robots: { index: false, follow: false },
};

export default async function ListingNewPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/listings/new");
  }

  // 매물 등록은 공인중개사 인증(isBroker)만 — 미인증 시 폼 대신 안내 (item 11)
  const expert = await getExpertStatus(session.user.email);
  if (!expert.isBroker) {
    return (
      <PageShell breadcrumb="실매물 › 매물 등록" title="매물 등록">
        <div className="mx-auto max-w-[520px]">
          <div className="rise-in card flex flex-col items-center gap-3 px-5 py-12 text-center">
            <div className="text-[26px]">🏢</div>
            <div className="text-[15px] font-extrabold text-ink">
              매물 등록은 공인중개사 인증 후 이용할 수 있어요
            </div>
            <p className="max-w-[420px] text-[13px] leading-[1.7] text-text-3">
              허위·과장 매물을 막기 위해 매물 등록은 개업공인중개사 인증을 마친
              사용자에게만 열려 있어요. 인증을 완료하면 이 화면에서 매물을 등록할 수
              있어요.
            </p>
            <Link href="/town/experts" className="btn-primary btn-md mt-1 no-underline">
              전문가 인증 신청
            </Link>
            <Link href="/my" className="text-[12px] font-bold text-text-3 no-underline">
              마이로 돌아가기 ›
            </Link>
          </div>
          <div className="mt-6 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
            중개 행위는 개업공인중개사가 수행하며, 누구집은 광고 매체로서 정보를
            게재할 뿐 중개 당사자가 아닙니다.
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell breadcrumb="실매물 › 매물 등록" title="매물 등록">
      <div className="rise-in mb-4 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-3 text-[13px] leading-[1.7] text-[#5b74b8]">
        등록하신 매물은 <b>검수 후 노출됩니다 (1~2일)</b>. 형식 요건을 확인한 뒤
        목록에 공개돼요. 집주인 직접 매물은 추후 등기부등본 등으로{" "}
        <b>소유 확인 절차</b>를 안내드릴 수 있어요.
      </div>

      <ListingForm />

      {/* 법적 고지 */}
      <div className="mt-8 max-w-[640px] rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        허위·과장 매물 등록 시 「공인중개사법」 등 관련 법령에 따라 제재를 받을 수
        있으며, 매물 정보의 정확성에 대한 책임은 등록자에게 있습니다. 누구집의
        검수는 형식 요건 확인일 뿐 매물의 진위·권리관계를 보증하지 않습니다. 중개
        행위는 해당 매물을 등록한 개업공인중개사가 수행하며, 누구집은 광고 매체로서
        정보를 게재할 뿐 중개 당사자가 아닙니다.
      </div>
    </PageShell>
  );
}
