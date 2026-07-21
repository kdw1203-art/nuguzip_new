import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { PageShell } from "../../components/PageShell";
import { DealForm } from "./DealForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "개발물건 등록 · 누구집",
  description:
    "시행사·부동산사업자가 개발물건을 등록하고 시공사·설계사·신탁·PF 등 협력업체의 참여 문의를 받습니다.",
  robots: { index: false, follow: false },
};

export default async function DevDealNewPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/dev-deals/new");
  }

  return (
    <PageShell breadcrumb="개발물건 중개 › 등록" title="개발물건 등록">
      <div className="rise-in mb-4 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-3 text-[13px] leading-[1.7] text-[#5b74b8]">
        정비사업·신축·부지 등 개발물건을 등록하면 <b>시공사·설계사·신탁·PF·기타 협력업체</b>가
        참여 문의를 보낼 수 있어요. 누구집은 소개·매칭만 담당하며, 계약·정산은 당사자 간에
        진행됩니다.
      </div>

      <DealForm />

      <div className="mt-8 max-w-[680px] rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        누구집은 개발물건의 소개·매칭 플랫폼으로, 당사자 간 계약·자금 정산에 관여하지 않습니다.
        게시 정보의 정확성은 등록자에게 있으며, 실제 거래·인허가·수수료 약정은 반드시 당사자 간
        확인 및 전문가(법무·세무·공인중개사 등) 자문을 거치시기 바랍니다. 표기된 중개 수수료는
        기준이며 사업 규모·조건에 따라 협의됩니다.
      </div>
    </PageShell>
  );
}
