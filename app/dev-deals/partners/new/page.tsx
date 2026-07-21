import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { PageShell } from "../../../components/PageShell";
import { PartnerForm } from "./PartnerForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "협력업체 등록 · 누구집",
  description:
    "시공사·설계사·신탁·PF 등 협력업체를 등록하고 조건에 맞는 개발물건 매칭을 받아 보세요.",
  robots: { index: false, follow: false },
};

export default async function DevPartnerNewPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/dev-deals/partners/new");
  }

  return (
    <PageShell breadcrumb="개발물건 중개 › 협력업체 등록" title="협력업체 등록">
      <div className="rise-in mb-4 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-3 text-[13px] leading-[1.7] text-[#5b74b8]">
        우리 회사를 협력업체로 등록하면 디렉터리에 노출되고, 조건에 맞는{" "}
        <b>개발물건 매칭·참여 기회</b>를 안내받을 수 있어요. 누구집은 소개·매칭만 담당하며,
        계약·정산은 당사자 간에 진행됩니다.
      </div>

      <PartnerForm />

      <div className="mt-8 max-w-[680px] rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        누구집은 개발물건의 소개·매칭 플랫폼으로, 당사자 간 계약·자금 정산에 관여하지 않습니다.
        게시 정보의 정확성은 등록자에게 있으며, 실제 거래·인허가·수수료 약정은 반드시 당사자 간
        확인 및 전문가(법무·세무·공인중개사 등) 자문을 거치시기 바랍니다. 표기된 중개 수수료는
        기준이며 사업 규모·조건에 따라 협의됩니다.
      </div>
    </PageShell>
  );
}
