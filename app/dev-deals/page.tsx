import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { listDeals } from "@/lib/dev-deals/store";
import {
  DEAL_TYPES,
  PARTNER_FIELDS,
  formatKrwEok,
  type DevDeal,
} from "@/lib/dev-deals/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "개발물건 중개 · 누구집",
  description:
    "시행사·부동산사업자가 개발물건(정비사업·신축·부지)을 등록하면 시공사·설계사·신탁·PF 등 협력업체가 참여 문의를 보내는 B2B 디벨로퍼 매칭. 누구집은 소개·중개(매칭)만 담당합니다.",
  robots: { index: true, follow: true },
};

const STATUS_LABEL: Record<string, string> = {
  open: "모집중",
  matched: "매칭 진행",
  closed: "마감",
};

const DISCLAIMER =
  "누구집은 개발물건의 소개·매칭 플랫폼으로, 당사자 간 계약·자금 정산에 관여하지 않습니다. 게시 정보의 정확성은 등록자에게 있으며, 실제 거래·인허가·수수료 약정은 반드시 당사자 간 확인 및 전문가(법무·세무·공인중개사 등) 자문을 거치시기 바랍니다. 표기된 중개 수수료는 기준이며 사업 규모·조건에 따라 협의됩니다.";

/** 현재 필터를 기준으로 특정 키만 바꾼 쿼리스트링 href 생성(같은 값이면 해제) */
function buildHref(
  base: { type?: string; partner?: string; region?: string },
  key: "type" | "partner" | "region",
  value: string | undefined,
): string {
  const next = { ...base };
  if (value === undefined || next[key] === value) delete next[key];
  else next[key] = value;
  const sp = new URLSearchParams();
  if (next.type) sp.set("type", next.type);
  if (next.partner) sp.set("partner", next.partner);
  if (next.region) sp.set("region", next.region);
  const qs = sp.toString();
  return qs ? `/dev-deals?${qs}` : "/dev-deals";
}

function SampleBadge() {
  return (
    <span
      className="chip"
      style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
    >
      예시
    </span>
  );
}

function DealCard({ d }: { d: DevDeal }) {
  return (
    <Link href={`/dev-deals/${d.id}`} className="card card-hover block p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
            {d.dealType}
          </span>
          {d.isVerified && (
            <span
              className="chip"
              style={{ background: "var(--success-soft)", color: "var(--success)" }}
            >
              검증
            </span>
          )}
          {d.isSample && <SampleBadge />}
        </div>
        <span className="shrink-0 rounded-full bg-[rgba(0,0,0,.05)] px-2 py-0.5 text-[10px] font-semibold text-text-2">
          {STATUS_LABEL[d.status] ?? d.status}
        </span>
      </div>

      <div className="mt-2 line-clamp-2 text-[14px] font-extrabold leading-[1.4] text-ink">
        {d.title}
      </div>
      <div className="mt-1 text-[11px] text-text-3">
        {[d.region, d.address].filter(Boolean).join(" · ") || "지역 미정"}
      </div>

      {d.summary && (
        <p className="mt-2 line-clamp-2 text-[12px] leading-[1.6] text-text-2">
          {d.summary}
        </p>
      )}

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-[10px] text-text-3">사업규모(총사업비)</div>
          <div className="text-[15px] font-extrabold text-primary">
            {formatKrwEok(d.totalCostKrw)}
          </div>
        </div>
        <div className="text-right text-[10px] text-text-3">
          조회 {d.viewCount.toLocaleString()} · 문의 {d.inquiryCount.toLocaleString()}
        </div>
      </div>

      {d.neededPartners.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {d.neededPartners.map((p) => (
            <span
              key={p}
              className="rounded-full bg-[rgba(0,0,0,.04)] px-2 py-0.5 text-[10px] font-medium text-text-2"
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export default async function DevDealsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; partner?: string; region?: string }>;
}) {
  const sp = await searchParams;
  const filter = {
    type: (sp.type ?? "").trim() || undefined,
    partner: (sp.partner ?? "").trim() || undefined,
    region: (sp.region ?? "").trim() || undefined,
  };

  const [all, deals] = await Promise.all([listDeals({}), listDeals(filter)]);

  // 지역 필터 옵션 — 전체 목록에서 유니크 추출
  const regions = Array.from(
    new Set(all.map((d) => d.region).filter((r): r is string => !!r)),
  ).sort();

  return (
    <PageShell breadcrumb="홈 › 개발물건 중개" title="개발물건 중개 (B2B 디벨로퍼 매칭)">
      <p className="rise-in mb-4 text-[13px] leading-[1.7] text-text-2">
        시행사·개발을 원하는 부동산사업자가 <strong className="text-ink">개발물건</strong>(정비사업·신축·부지 등)을
        등록하면, <strong className="text-ink">시공사·설계사·신탁·PF·기타 협력업체</strong>가 이를 발견해 참여
        문의·제안을 보냅니다. 누구집은 양측을 이어주는 <strong className="text-ink">소개·중개(매칭)</strong> 역할을
        하며, 매칭 성사 시 사업규모(사업비)에 따른 중개 수수료를 받습니다.{" "}
        <strong className="text-ink">결제·정산은 진행하지 않으며</strong> 실제 계약·정산은 당사자 간 오프라인으로
        진행됩니다.
      </p>

      {/* 상단 CTA */}
      <section className="rise-in-1 mb-5 flex flex-wrap gap-2">
        <Link href="/dev-deals/new" className="btn-primary btn-md no-underline">
          개발물건 등록
        </Link>
        <Link href="/dev-deals/partners" className="btn-outline btn-md no-underline">
          협력업체 찾기 / 등록
        </Link>
        <Link href="/dev-deals/fees" className="btn-outline btn-md no-underline">
          중개 수수료 안내
        </Link>
      </section>

      {/* 유형 필터 */}
      <section className="rise-in-1 mb-2">
        <div className="mb-1 text-[11px] font-bold text-text-3">개발물건 유형</div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref(filter, "type", undefined)}
            className={!filter.type ? "chip-active" : "chip"}
          >
            전체
          </Link>
          {DEAL_TYPES.map((t) => (
            <Link
              key={t}
              href={buildHref(filter, "type", t)}
              className={filter.type === t ? "chip-active" : "chip"}
            >
              {t}
            </Link>
          ))}
        </div>
      </section>

      {/* 필요 협력 분야 필터 */}
      <section className="rise-in-1 mb-2">
        <div className="mb-1 text-[11px] font-bold text-text-3">필요 협력 분야</div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref(filter, "partner", undefined)}
            className={!filter.partner ? "chip-active" : "chip"}
          >
            전체
          </Link>
          {PARTNER_FIELDS.map((p) => (
            <Link
              key={p}
              href={buildHref(filter, "partner", p)}
              className={filter.partner === p ? "chip-active" : "chip"}
            >
              {p}
            </Link>
          ))}
        </div>
      </section>

      {/* 지역 필터 */}
      {regions.length > 0 && (
        <section className="rise-in-1 mb-5">
          <div className="mb-1 text-[11px] font-bold text-text-3">지역</div>
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={buildHref(filter, "region", undefined)}
              className={!filter.region ? "chip-active" : "chip"}
            >
              전체
            </Link>
            {regions.map((r) => (
              <Link
                key={r}
                href={buildHref(filter, "region", r)}
                className={filter.region === r ? "chip-active" : "chip"}
              >
                {r}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 목록 */}
      {deals.length === 0 ? (
        <section className="rise-in-2 card p-[var(--pad-card)]">
          <div className="rounded-[12px] border border-line bg-surface px-4 py-10 text-center text-[13px] text-text-3">
            조건에 맞는 개발물건이 아직 없어요.{" "}
            <Link href="/dev-deals/new" className="font-bold text-primary underline">
              개발물건을 등록
            </Link>
            해 협력업체의 참여 문의를 받아 보세요.
          </div>
        </section>
      ) : (
        <section className="rise-in-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          {deals.map((d) => (
            <DealCard key={d.id} d={d} />
          ))}
        </section>
      )}

      {/* 법적 고지 */}
      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        {DISCLAIMER}
      </div>
    </PageShell>
  );
}
