import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import {
  COMMISSION_TIERS,
  COMMISSION_BASIS_LABEL,
} from "@/lib/dev-deals/commission";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "중개 수수료 안내 · 개발물건 중개 · 누구집",
  description:
    "개발물건 매칭 중개 수수료 안내 — 소개·문의는 무료, 성사 시에만 사업규모(사업비)에 따른 기준 수수료가 부과됩니다. 실제 수수료는 협의 가능합니다.",
  robots: { index: true, follow: true },
};

const STEPS = [
  {
    n: "1",
    t: "등록",
    d: "시행사·부동산사업자가 개발물건을 등록하고, 협력업체는 회사 프로필을 등록합니다.",
  },
  {
    n: "2",
    t: "소개·매칭",
    d: "누구집이 조건에 맞는 협력업체를 소개하고, 협력업체는 참여 문의·제안을 보냅니다. (무료)",
  },
  {
    n: "3",
    t: "성사 시 수수료",
    d: "당사자 간 협력이 성사되면 사업규모(사업비)에 따른 기준 수수료를 협의해 부과합니다.",
  },
];

const DISCLAIMER =
  "누구집은 개발물건의 소개·매칭 플랫폼으로, 당사자 간 계약·자금 정산에 관여하지 않습니다. 게시 정보의 정확성은 등록자에게 있으며, 실제 거래·인허가·수수료 약정은 반드시 당사자 간 확인 및 전문가(법무·세무·공인중개사 등) 자문을 거치시기 바랍니다. 표기된 중개 수수료는 기준이며 사업 규모·조건에 따라 협의됩니다.";

export default function DevFeesPage() {
  return (
    <PageShell breadcrumb="홈 › 개발물건 중개 › 수수료 안내" title="중개 수수료 안내">
      <p className="rise-in mb-4 text-[13px] leading-[1.7] text-text-2">
        누구집은 개발물건과 협력업체를 이어주는 <strong className="text-ink">소개·매칭</strong> 플랫폼입니다.{" "}
        <strong className="text-ink">소개·문의는 무료</strong>이며, 매칭이 성사된 경우에만 사업규모(사업비)에 따른
        중개 수수료가 부과됩니다. 아래 요율은 {COMMISSION_BASIS_LABEL} 기준이며 실제 금액은 사업 규모·조건에 따라
        협의됩니다.
      </p>

      {/* 진행 방식 */}
      <section className="rise-in-1 mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="card p-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-[13px] font-extrabold text-primary">
              {s.n}
            </div>
            <div className="mt-2 text-[14px] font-extrabold text-ink">{s.t}</div>
            <p className="mt-1 text-[12px] leading-[1.7] text-text-2">{s.d}</p>
          </div>
        ))}
      </section>

      {/* 수수료 표 */}
      <section className="rise-in-2 card p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          사업규모별 기준 수수료{" "}
          <span className="text-[11px] font-medium text-text-3">(협의 가능)</span>
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-text-3">
                <th className="py-2 pr-4 font-semibold">사업규모(총사업비)</th>
                <th className="py-2 font-semibold">기준 요율</th>
              </tr>
            </thead>
            <tbody>
              {COMMISSION_TIERS.map((t) => (
                <tr key={t.label} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-4 font-bold text-ink">{t.label}</td>
                  <td className="py-2.5 font-extrabold text-primary">{t.rateText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] leading-[1.7] text-text-2">
          <b>소개·문의는 무료</b>이며, 수수료는 <b>매칭 성사 시에만</b> 부과됩니다. 위 요율은
          기준값으로, 사업 규모·구조·리스크·협력 범위에 따라 개별 협의됩니다. 50억 미만 사업은
          정률 없이 성사 시 협의합니다.
        </p>
      </section>

      {/* CTA */}
      <section className="rise-in-3 mt-6 flex flex-wrap gap-2">
        <Link href="/dev-deals/new" className="btn-primary btn-md no-underline">
          개발물건 등록
        </Link>
        <Link href="/dev-deals/partners/new" className="btn-outline btn-md no-underline">
          협력업체 등록
        </Link>
        <Link href="/dev-deals" className="btn-outline btn-md no-underline">
          개발물건 보기
        </Link>
      </section>

      {/* 법적 고지 */}
      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        {DISCLAIMER}
      </div>
    </PageShell>
  );
}
