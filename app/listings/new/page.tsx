import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
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
