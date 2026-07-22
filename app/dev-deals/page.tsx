import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { listDeals } from "@/lib/dev-deals/store";
import {
  DEAL_TYPES,
  PARTNER_FIELDS,
  formatKrwEok,
  formatAreaM2,
  type DevDeal,
} from "@/lib/dev-deals/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "개발물건 중개 · 누구집",
  description:
    "시행사·부동산사업자가 개발물건(정비사업·신축·부지)을 등록하면 시공사·설계사·신탁·PF 등 협력업체가 참여 문의를 보내는 B2B 디벨로퍼 매칭. 누구집은 소개·중개(매칭)만 담당합니다.",
  robots: { index: true, follow: true },
};

/** 테마 구분: 개발물건 중개 = 앰버(디벨로퍼 매칭). 하위 클래스(text-primary·
 *  bg-primary-soft·chip-active·btn-primary·btn-outline)가 이 subtree 안에서
 *  앰버로 재테마된다. 강한 앰버 텍스트는 var(--primary-strong)로 직접 지정. */
const DEV_THEME = {
  "--primary": "#d97706",
  "--primary-soft": "#fdf1df",
  "--primary-strong": "#b45309",
} as CSSProperties;

const STATUS_LABEL: Record<string, string> = {
  open: "모집중",
  matched: "매칭 진행",
  closed: "마감",
};

const DISCLAIMER =
  "누구집은 개발물건의 소개·매칭 플랫폼으로, 당사자 간 계약·자금 정산에 관여하지 않습니다. 게시 정보의 정확성은 등록자에게 있으며, 실제 거래·인허가·수수료 약정은 반드시 당사자 간 확인 및 전문가(법무·세무·공인중개사 등) 자문을 거치시기 바랍니다. 표기된 중개 수수료는 기준이며 사업 규모·조건에 따라 협의됩니다.";

/** 매칭 흐름 3단계 (사이드 카드) */
const MATCH_STEPS: { title: string; desc: string }[] = [
  {
    title: "개발물건 등록",
    desc: "시행사·부동산사업자가 정비사업·신축·부지 정보를 올려요.",
  },
  {
    title: "발견·참여 문의",
    desc: "시공·설계·신탁·PF 등 협력업체가 조건을 보고 참여 문의를 보내요.",
  },
  {
    title: "매칭·수수료",
    desc: "매칭 성사 시 사업규모 기준 중개 수수료가 발생하고, 계약·정산은 당사자 간 진행돼요.",
  },
];

/** 등록 물건이 0건일 때 레이아웃을 보여주기 위한 예시 카드용 더미(예시 배지 표시) */
const EXAMPLE_DEAL: DevDeal = {
  id: "example",
  ownerEmail: null,
  title: "○○구 가로주택정비사업 — 시공·설계·신탁·PF 협력사 모집",
  dealType: "가로주택정비",
  region: "서울 성북",
  address: null,
  landAreaM2: 3200,
  grossFloorAreaM2: 11800,
  units: 168,
  totalCostKrw: 42000000000,
  neededPartners: ["시공", "설계", "신탁", "PF"],
  budgetText: null,
  summary:
    "노후 저층주거지 가로주택정비 — 조합 설립 완료. 시공·설계·신탁·PF 협력사를 찾습니다.",
  description: null,
  contactName: "김담당",
  contactMasked: "010-****-1234",
  status: "open",
  isVerified: false,
  isSample: true,
  viewCount: 0,
  inquiryCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: null,
};

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

/** 필터 칩 클래스 — 선택 시 잉크(다크), 미선택 시 글래스(앰버 테마 상속) */
function pillClass(active: boolean): string {
  return active
    ? "chip-active px-3.5 py-2 text-[13px] no-underline press"
    : "chip glass px-3.5 py-2 text-[13px] font-semibold text-text-2 no-underline press";
}

/** 상태 배지 인라인 스타일 — open은 앰버, matched는 성공, 그 외 중립 */
function statusStyle(status: string): CSSProperties {
  if (status === "open")
    return { background: "var(--primary-soft)", color: "var(--primary-strong)" };
  if (status === "matched")
    return { background: "var(--success-soft)", color: "var(--success)" };
  return { background: "rgba(0,0,0,.05)", color: "var(--text-2)" };
}

function SampleBadge() {
  return (
    <span
      className="chip px-2 py-0.5 text-[10px]"
      style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
    >
      예시
    </span>
  );
}

/** 청약센터 스타일의 개발물건 카드(앰버 테마) — 사업유형·지역·규모·총사업비·협력분야·참여 문의 */
function DealCard({ d }: { d: DevDeal }) {
  const stats: { label: string; value: string }[] = [];
  if (d.units && d.units > 0)
    stats.push({ label: "규모", value: `${d.units.toLocaleString()}세대` });
  const gfa = formatAreaM2(d.grossFloorAreaM2);
  if (gfa !== "—") stats.push({ label: "연면적", value: gfa });
  const land = formatAreaM2(d.landAreaM2);
  if (land !== "—") stats.push({ label: "부지면적", value: land });

  return (
    <article className="card card-hover flex flex-col gap-3 rounded-2xl p-[var(--pad-card)]">
      {/* 배지 행 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-extrabold text-primary">
            {d.dealType}
          </span>
          {d.isVerified && (
            <span
              className="chip px-2 py-0.5 text-[10px]"
              style={{ background: "var(--success-soft)", color: "var(--success)" }}
            >
              검증
            </span>
          )}
          {d.isSample && <SampleBadge />}
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold"
          style={statusStyle(d.status)}
        >
          {STATUS_LABEL[d.status] ?? d.status}
        </span>
      </div>

      {/* 제목 + 지역 */}
      <div>
        <Link
          href={`/dev-deals/${d.id}`}
          className="line-clamp-2 text-[15px] font-extrabold leading-[1.4] text-ink no-underline"
        >
          {d.title}
        </Link>
        <div className="mt-1 text-[11px] text-text-3">
          {[d.region, d.address].filter(Boolean).join(" · ") || "지역 미정"}
        </div>
      </div>

      {d.summary && (
        <p className="line-clamp-2 text-[12px] leading-[1.6] text-text-2">{d.summary}</p>
      )}

      {/* 규모·총사업비 스탯 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-primary-soft px-3 py-2.5">
          <div className="text-[10px]" style={{ color: "var(--primary-strong)" }}>
            총사업비
          </div>
          <div className="mt-0.5 text-[15px] font-extrabold text-primary">
            {formatKrwEok(d.totalCostKrw)}
          </div>
        </div>
        {stats.slice(0, 2).map((s) => (
          <div key={s.label} className="rounded-xl bg-bg px-3 py-2.5">
            <div className="text-[10px] text-text-3">{s.label}</div>
            <div className="mt-0.5 text-[14px] font-extrabold text-ink">{s.value}</div>
          </div>
        ))}
      </div>

      {/* 필요 협력분야 */}
      {d.neededPartners.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-bold text-text-3">필요 협력분야</div>
          <div className="flex flex-wrap gap-1">
            {d.neededPartners.map((p) => (
              <span key={p} className="chip-tag px-2 py-0.5 text-[10px]">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 푸터: 마스킹 연락처 + 참여 문의 CTA */}
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0 text-[10px] leading-[1.5] text-text-3">
          {d.contactMasked && (
            <div className="truncate">
              담당 {d.contactName ? `${d.contactName} · ` : ""}
              {d.contactMasked}
            </div>
          )}
          <div>
            조회 {d.viewCount.toLocaleString()} · 문의 {d.inquiryCount.toLocaleString()}
          </div>
        </div>
        <Link
          href={`/dev-deals/${d.id}`}
          className="btn-primary btn-sm shrink-0 no-underline press"
        >
          참여 문의 ›
        </Link>
      </div>
    </article>
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

  const openCount = all.filter((d) => d.status === "open").length;
  const filterActive = !!(filter.type || filter.partner || filter.region);

  return (
    <PageShell breadcrumb="동네이야기 › 개발물건 중개" wide>
      <div style={DEV_THEME}>
        {/* 헤더 · 역할 요약(면책 취지 포함) */}
        <div className="rise-in mb-4">
          <h1 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[21px] font-extrabold leading-[1.3] text-ink">
            개발물건 중개
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[12px] font-bold text-primary">
              B2B 디벨로퍼 매칭
            </span>
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-[1.7] text-text-2">
            시행사·개발을 원하는 부동산사업자가 <strong className="text-ink">개발물건</strong>
            (정비사업·신축·부지 등)을 등록하면,{" "}
            <strong className="text-ink">시공사·설계사·신탁·PF·기타 협력업체</strong>가 이를 발견해
            참여 문의·제안을 보냅니다. 누구집은 양측을 이어주는{" "}
            <strong className="text-ink">소개·중개(매칭)</strong> 역할만 하며{" "}
            <strong className="text-ink">결제·정산은 진행하지 않습니다</strong> — 실제 계약·정산은
            당사자 간 오프라인으로 진행됩니다.
          </p>
        </div>

        {/* 역할·출처 안내 배너(앰버 틴트) */}
        <div
          className="rise-in mb-4 flex items-start gap-2 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6]"
          style={{ color: "var(--primary-strong)" }}
        >
          <span className="mt-px shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-extrabold">
            안내
          </span>
          <span>
            누구집은 개발물건 <strong>소개·매칭 플랫폼</strong>이에요. 게시 정보의 정확성·거래 책임은
            당사자에게 있으며, <strong>결제·자금 정산은 제공하지 않습니다.</strong> 계약·인허가·수수료
            약정은 반드시 당사자 확인과 전문가 자문을 거치세요.
          </span>
        </div>

        {/* 상단 필터(유형) + CTA 칩 + 요약 */}
        <div className="rise-in-1 mb-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={buildHref(filter, "type", undefined)}
                className={pillClass(!filter.type)}
              >
                전체
              </Link>
              {DEAL_TYPES.map((t) => (
                <Link
                  key={t}
                  href={buildHref(filter, "type", t)}
                  className={pillClass(filter.type === t)}
                >
                  {t}
                </Link>
              ))}
            </div>
            <div className="flex-1" />
            <div className="flex flex-wrap gap-1.5">
              <Link
                href="/dev-deals/partners"
                className="glass rounded-full px-3.5 py-2 text-[12px] font-bold text-text-1 no-underline press"
              >
                협력업체 디렉토리
              </Link>
              <Link
                href="/dev-deals/fees"
                className="glass rounded-full px-3.5 py-2 text-[12px] font-bold text-primary no-underline press"
              >
                수수료 안내
              </Link>
              <Link
                href="/dev-deals/new"
                style={{ color: "#fff" }}
                className="rounded-full bg-primary px-4 py-2 text-[12px] font-bold no-underline press"
              >
                개발물건 등록
              </Link>
            </div>
          </div>
          <div className="text-[12px] text-text-3">
            등록 물건 <strong className="text-ink">{all.length.toLocaleString()}건</strong>
            {openCount > 0 && (
              <>
                {" · "}
                모집중{" "}
                <strong style={{ color: "var(--primary-strong)" }}>
                  {openCount.toLocaleString()}건
                </strong>
              </>
            )}
            {filterActive && (
              <>
                {" · "}
                현재 조건 <strong className="text-ink">{deals.length.toLocaleString()}건</strong>
              </>
            )}
          </div>
        </div>

        {/* 2단 레이아웃 */}
        <div className="grid gap-5 md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_340px]">
          {/* 메인 — 개발물건 목록 */}
          <div className="rise-in-2 flex flex-col gap-4">
            {/* 보조 필터: 협력분야 · 지역 */}
            <div className="flex flex-col gap-2.5">
              <div>
                <div className="mb-1 text-[10px] font-bold text-text-3">필요 협력분야</div>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    href={buildHref(filter, "partner", undefined)}
                    className={pillClass(!filter.partner)}
                  >
                    전체
                  </Link>
                  {PARTNER_FIELDS.map((p) => (
                    <Link
                      key={p}
                      href={buildHref(filter, "partner", p)}
                      className={pillClass(filter.partner === p)}
                    >
                      {p}
                    </Link>
                  ))}
                </div>
              </div>
              {regions.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-bold text-text-3">지역</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      href={buildHref(filter, "region", undefined)}
                      className={pillClass(!filter.region)}
                    >
                      전체
                    </Link>
                    {regions.map((r) => (
                      <Link
                        key={r}
                        href={buildHref(filter, "region", r)}
                        className={pillClass(filter.region === r)}
                      >
                        {r}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold text-ink">등록된 개발물건</h2>
              <span className="text-[11px] text-text-3">{deals.length.toLocaleString()}건</span>
            </div>

            {deals.length === 0 ? (
              <div className="flex flex-col gap-3">
                <div className="card rounded-2xl p-[var(--pad-card)] text-center">
                  <div className="text-[14px] font-extrabold text-ink">
                    조건에 맞는 개발물건이 아직 없어요
                  </div>
                  <p className="mx-auto mt-1 max-w-md text-[12px] leading-[1.6] text-text-3">
                    아래는 등록 시 노출되는 화면 <b>예시</b>예요. 개발물건을 등록하면
                    시공·설계·신탁·PF 등 협력업체의 참여 문의를 받아볼 수 있어요.
                  </p>
                  <Link
                    href="/dev-deals/new"
                    className="btn-primary btn-md mt-3 inline-flex no-underline press"
                  >
                    개발물건 등록
                  </Link>
                </div>
                <DealCard d={EXAMPLE_DEAL} />
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {deals.map((d) => (
                  <DealCard key={d.id} d={d} />
                ))}
              </div>
            )}
          </div>

          {/* 사이드 — 매칭 안내 · 수수료 · 등록 유도 */}
          <aside className="rise-in-3 flex flex-col gap-3">
            <div className="card rounded-2xl p-[var(--pad-card)]">
              <div className="text-[14px] font-extrabold text-ink">이렇게 매칭돼요</div>
              <ol className="mt-3 flex flex-col gap-3">
                {MATCH_STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-3">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-extrabold"
                      style={{ color: "var(--primary-strong)" }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <div className="text-[13px] font-bold text-ink">{s.title}</div>
                      <div className="text-[11px] leading-[1.6] text-text-3">{s.desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="card rounded-2xl p-[var(--pad-card)]">
              <div className="text-[14px] font-extrabold text-ink">중개 수수료</div>
              <p className="mt-1.5 text-[12px] leading-[1.6] text-text-2">
                매칭이 성사되면 <strong className="text-ink">사업규모(총사업비)</strong>에 따라 중개
                수수료가 부과돼요. <strong className="text-ink">누구집은 결제·정산을 진행하지 않으며</strong>{" "}
                실제 정산은 당사자 간에 이뤄집니다.
              </p>
              <Link
                href="/dev-deals/fees"
                className="mt-3 inline-flex text-[12px] font-bold text-primary no-underline press"
              >
                수수료 기준표 보기 ›
              </Link>
            </div>

            <div className="card rounded-2xl p-[var(--pad-card)]">
              <div className="text-[14px] font-extrabold text-ink">협력업체를 찾으시나요?</div>
              <p className="mt-1.5 text-[12px] leading-[1.6] text-text-2">
                검증된 시공·설계·신탁·PF·마케팅·감리 협력업체를 디렉토리에서 확인하고, 우리 회사를
                등록해 매칭 기회를 받으세요.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href="/dev-deals/partners"
                  className="btn-outline btn-md no-underline press"
                >
                  협력업체 디렉토리
                </Link>
                <Link
                  href="/dev-deals/new"
                  className="btn-primary btn-md no-underline press"
                >
                  개발물건 등록하기
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {/* 면책 고지(앰버 틴트) */}
        <div
          className="rise-in-4 mt-8 rounded-xl bg-primary-soft px-4 py-3 text-[11px] leading-[1.7]"
          style={{ color: "var(--primary-strong)" }}
        >
          {DISCLAIMER}
        </div>
      </div>
    </PageShell>
  );
}
