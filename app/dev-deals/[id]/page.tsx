import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { getDeal, incrementDealView } from "@/lib/dev-deals/store";
import { estimateCommission, COMMISSION_BASIS_LABEL } from "@/lib/dev-deals/commission";
import { formatKrwEok, formatAreaM2 } from "@/lib/dev-deals/types";
import { InquiryForm } from "./InquiryForm";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "모집중",
  matched: "매칭 진행",
  closed: "마감",
};

const DISCLAIMER =
  "누구집은 개발물건의 소개·매칭 플랫폼으로, 당사자 간 계약·자금 정산에 관여하지 않습니다. 게시 정보의 정확성은 등록자에게 있으며, 실제 거래·인허가·수수료 약정은 반드시 당사자 간 확인 및 전문가(법무·세무·공인중개사 등) 자문을 거치시기 바랍니다. 표기된 중개 수수료는 기준이며 사업 규모·조건에 따라 협의됩니다.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) {
    return { title: "개발물건을 찾을 수 없습니다 · 누구집" };
  }
  return {
    title: `${deal.title} · 개발물건 중개 · 누구집`,
    description:
      deal.summary ??
      `${deal.dealType} · ${deal.region ?? ""} · 사업규모 ${formatKrwEok(deal.totalCostKrw)}`,
    robots: { index: !deal.isSample, follow: true },
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <div className="text-[10px] text-text-3">{label}</div>
      <div className="mt-0.5 text-[14px] font-extrabold text-ink">{value}</div>
    </div>
  );
}

export default async function DevDealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) notFound();

  // 조회수 +1 (best-effort)
  await incrementDealView(id);

  const commission = estimateCommission(deal.totalCostKrw);

  return (
    <PageShell breadcrumb="홈 › 개발물건 중개 › 상세" title={deal.title}>
      {/* 상단 배지 */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[12px] font-semibold text-primary">
          {deal.dealType}
        </span>
        <span className="rounded-full bg-[rgba(0,0,0,.05)] px-2.5 py-1 text-[11px] font-semibold text-text-2">
          {STATUS_LABEL[deal.status] ?? deal.status}
        </span>
        {deal.isVerified && (
          <span
            className="chip"
            style={{ background: "var(--success-soft)", color: "var(--success)" }}
          >
            검증
          </span>
        )}
        {deal.isSample && (
          <span
            className="chip"
            style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
          >
            예시
          </span>
        )}
      </div>

      {deal.isSample && (
        <div
          className="rise-in mb-4 rounded-xl px-4 py-2.5 text-[12px] leading-[1.6]"
          style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
        >
          예시 데이터입니다. 실제 등록된 개발물건이 아니며 서비스 화면 안내를 위한 샘플입니다.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        {/* 본문 */}
        <div className="flex flex-col gap-5">
          {/* 위치 */}
          <div className="rise-in-1 text-[13px] text-text-2">
            {[deal.region, deal.address].filter(Boolean).join(" · ") || "지역 미정"}
          </div>

          {/* 사업규모 breakdown */}
          <section className="rise-in-1 card p-[var(--pad-card)]">
            <h2 className="mb-3 text-[15px] font-extrabold text-ink">사업규모</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="부지면적" value={formatAreaM2(deal.landAreaM2)} />
              <Stat label="연면적" value={formatAreaM2(deal.grossFloorAreaM2)} />
              <Stat
                label="세대수"
                value={deal.units != null ? `${deal.units.toLocaleString()}세대` : "—"}
              />
              <Stat label="총사업비" value={formatKrwEok(deal.totalCostKrw)} />
            </div>
            {deal.budgetText && (
              <p className="mt-3 text-[12px] leading-[1.7] text-text-2">
                {deal.budgetText}
              </p>
            )}
          </section>

          {/* 필요 협력업체 */}
          {deal.neededPartners.length > 0 && (
            <section className="rise-in-2 card p-[var(--pad-card)]">
              <h2 className="mb-2 text-[15px] font-extrabold text-ink">필요 협력 분야</h2>
              <div className="flex flex-wrap gap-1.5">
                {deal.neededPartners.map((p) => (
                  <span
                    key={p}
                    className="rounded-full bg-primary-soft px-2.5 py-1 text-[12px] font-semibold text-primary"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* 상세 설명 */}
          {(deal.summary || deal.description) && (
            <section className="rise-in-2 card p-[var(--pad-card)]">
              <h2 className="mb-2 text-[15px] font-extrabold text-ink">사업 개요</h2>
              {deal.summary && (
                <p className="text-[13px] font-semibold leading-[1.7] text-ink">
                  {deal.summary}
                </p>
              )}
              {deal.description && (
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.8] text-text-2">
                  {deal.description}
                </p>
              )}
            </section>
          )}

          {/* 예상 중개수수료 */}
          <section className="rise-in-3 card p-[var(--pad-card)]">
            <h2 className="mb-1 text-[15px] font-extrabold text-ink">
              예상 중개수수료
            </h2>
            <p className="mb-3 text-[11px] text-text-3">
              {COMMISSION_BASIS_LABEL} — 사업 규모·조건에 따라 협의됩니다.
            </p>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <div className="text-[10px] text-text-3">해당 구간</div>
                <div className="text-[14px] font-bold text-ink">
                  {commission.tierLabel}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-text-3">기준 요율</div>
                <div className="text-[14px] font-bold text-ink">
                  {commission.rateText}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-text-3">예상 수수료(기준)</div>
                <div className="text-[16px] font-extrabold text-primary">
                  {commission.estimatedKrw != null
                    ? formatKrwEok(commission.estimatedKrw)
                    : "성사 시 협의"}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-[1.6] text-text-3">
              소개·문의는 무료이며, 수수료는 매칭 성사 시에만 부과됩니다.{" "}
              <Link href="/dev-deals/fees" className="font-bold text-primary underline">
                수수료 안내 자세히
              </Link>
            </p>
          </section>
        </div>

        {/* 사이드: 연락처 + 문의 폼 */}
        <aside className="flex flex-col gap-5">
          <section className="card p-[var(--pad-card)]">
            <h2 className="mb-2 text-[15px] font-extrabold text-ink">등록자 연락처</h2>
            <div className="text-[13px] text-text-2">
              담당자{" "}
              <b className="text-ink">{deal.contactName ?? "등록자"}</b>
            </div>
            <div className="mt-1 text-[13px] text-text-2">
              연락처 <b className="text-ink">{deal.contactMasked ?? "문의 시 공개"}</b>
            </div>
            <p className="mt-2 text-[11px] leading-[1.6] text-text-3">
              연락처는 개인정보 보호를 위해 일부만 표시됩니다. 아래 참여 문의를 남기면
              등록자에게 전달됩니다.
            </p>
          </section>

          <section className="card p-[var(--pad-card)]">
            <h2 className="mb-3 text-[15px] font-extrabold text-ink">참여 문의</h2>
            <InquiryForm dealId={deal.id} isSample={deal.isSample} />
          </section>
        </aside>
      </div>

      {/* 법적 고지 */}
      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        {DISCLAIMER}
      </div>
    </PageShell>
  );
}
