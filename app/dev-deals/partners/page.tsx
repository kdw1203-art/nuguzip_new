import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { listPartners } from "@/lib/dev-deals/store";
import { PARTNER_TYPES, type DevPartner } from "@/lib/dev-deals/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "협력업체 디렉터리 · 개발물건 중개 · 누구집",
  description:
    "시공사·설계사·신탁·PF·마케팅·감리 등 개발사업 협력업체를 찾고, 우리 회사를 등록해 개발물건 매칭을 받아 보세요.",
  robots: { index: true, follow: true },
};

const DISCLAIMER =
  "누구집은 개발물건의 소개·매칭 플랫폼으로, 당사자 간 계약·자금 정산에 관여하지 않습니다. 게시 정보의 정확성은 등록자에게 있으며, 실제 거래·인허가·수수료 약정은 반드시 당사자 간 확인 및 전문가(법무·세무·공인중개사 등) 자문을 거치시기 바랍니다. 표기된 중개 수수료는 기준이며 사업 규모·조건에 따라 협의됩니다.";

function PartnerCard({ p }: { p: DevPartner }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
            {p.partnerType}
          </span>
          {p.isVerified && (
            <span
              className="chip"
              style={{ background: "var(--success-soft)", color: "var(--success)" }}
            >
              검증
            </span>
          )}
          {p.isSample && (
            <span
              className="chip"
              style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
            >
              예시
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 text-[14px] font-extrabold text-ink">{p.companyName}</div>
      <div className="mt-0.5 text-[11px] text-text-3">{p.region ?? "지역 전국·협의"}</div>

      {p.intro && (
        <p className="mt-2 line-clamp-3 text-[12px] leading-[1.6] text-text-2">
          {p.intro}
        </p>
      )}

      {p.specialties.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.specialties.map((s) => (
            <span
              key={s}
              className="rounded-full bg-[rgba(0,0,0,.04)] px-2 py-0.5 text-[10px] font-medium text-text-2"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-text-3">
        <span>연락처 {p.contactMasked ?? "문의 시 공개"}</span>
        {p.portfolioUrl && (
          <a
            href={p.portfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline"
          >
            포트폴리오
          </a>
        )}
      </div>
    </div>
  );
}

export default async function DevPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const active = (type ?? "").trim() || undefined;
  const partners = await listPartners({ type: active });

  return (
    <PageShell breadcrumb="홈 › 개발물건 중개 › 협력업체" title="협력업체 디렉터리">
      <p className="rise-in mb-4 text-[13px] leading-[1.7] text-text-2">
        시공사·설계사·신탁·PF·마케팅·감리 등 개발사업 <strong className="text-ink">협력업체</strong>를 찾아보세요.
        우리 회사를 등록하면 조건에 맞는 <strong className="text-ink">개발물건 매칭</strong>과 참여 기회를 받을 수
        있어요.
      </p>

      <section className="rise-in-1 mb-4 flex flex-wrap gap-2">
        <Link href="/dev-deals/partners/new" className="btn-primary btn-md no-underline">
          협력업체 등록
        </Link>
        <Link href="/dev-deals" className="btn-outline btn-md no-underline">
          개발물건 보기
        </Link>
      </section>

      {/* 유형 필터 */}
      <section className="rise-in-1 mb-5 flex flex-wrap gap-1.5">
        <Link href="/dev-deals/partners" className={!active ? "chip-active" : "chip"}>
          전체
        </Link>
        {PARTNER_TYPES.map((t) => (
          <Link
            key={t}
            href={`/dev-deals/partners?type=${encodeURIComponent(t)}`}
            className={active === t ? "chip-active" : "chip"}
          >
            {t}
          </Link>
        ))}
      </section>

      {partners.length === 0 ? (
        <section className="rise-in-2 card p-[var(--pad-card)]">
          <div className="rounded-[12px] border border-line bg-surface px-4 py-10 text-center text-[13px] text-text-3">
            해당 유형의 협력업체가 아직 없어요.{" "}
            <Link
              href="/dev-deals/partners/new"
              className="font-bold text-primary underline"
            >
              협력업체로 등록
            </Link>
            해 매칭을 받아 보세요.
          </div>
        </section>
      ) : (
        <section className="rise-in-2 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {partners.map((p) => (
            <PartnerCard key={p.id} p={p} />
          ))}
        </section>
      )}

      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        {DISCLAIMER}
      </div>
    </PageShell>
  );
}
