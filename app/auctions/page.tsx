import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import {
  getAuctions,
  getAuctionCount,
  AUCTION_USAGE_FILTERS,
  type AuctionItem,
} from "@/lib/onbid/store";
import {
  getCourtAuctions,
  getCourtAuctionCount,
  COURT_USAGE_FILTERS,
  type CourtAuctionItem,
} from "@/lib/court-auction/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "서울 공매 물건 (온비드) | 누구집",
  description:
    "한국자산관리공사 온비드 공매 부동산 — 서울권 아파트·오피스텔·빌라 감정가·최저입찰가·입찰일정. 공공 데이터 기반.",
  robots: { index: true, follow: true },
};

/** 테마 구분: 공매·경매 = 보라 (딜·긴급). subtree 안에서 text-primary·bg-primary-soft·
 *  chip-active·btn-primary 가 보라로 재테마됨 (예시 배지 앰버는 그대로 대비 유지). */
const AUCTION_THEME = {
  "--primary": "#7c3aed",
  "--primary-soft": "#f1ebfe",
  "--primary-strong": "#6528d6",
} as CSSProperties;

/* ── 포맷 헬퍼 ────────────────────────────────────────────── */
function fmtKrw(won: number | null): string {
  if (!won || won <= 0) return "—";
  const eok = won / 100_000_000;
  if (eok >= 1) return `${eok >= 10 ? eok.toFixed(1) : eok.toFixed(2)}억`;
  return `${Math.round(won / 10_000).toLocaleString()}만`;
}
function fmtDt(v: string | null): string {
  if (!v || v.length < 8) return "—";
  return `${v.slice(0, 4)}.${v.slice(4, 6)}.${v.slice(6, 8)}`;
}
// 법원경매 bid_date 는 text — "20260815"·"2026-08-15" 등 형식 관용 처리
function fmtCourtDate(v: string | null): string {
  if (!v) return "—";
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  }
  return v;
}
/** 매각기일·입찰마감 문자열 → D-day 배지. 지난 일정·형식 불명이면 null. */
function ddayFrom(v: string | null): { label: string; urgent: boolean } | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const y = Number(digits.slice(0, 4));
  const mo = Number(digits.slice(4, 6));
  const da = Number(digits.slice(6, 8));
  if (!y || !mo || !da) return null;
  const target = new Date(y, mo - 1, da);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return null;
  if (diff === 0) return { label: "D-DAY", urgent: true };
  return { label: `D-${diff}`, urgent: diff <= 3 };
}

/** 이미 가져온 목록에서 용도 분포 집계 (가짜 수치 없음 · 표시 물건 기준) */
function usageDistribution(
  items: { usage: string | null }[],
  filters: { key: string; label: string; match: string[] }[],
): { label: string; count: number }[] {
  return filters
    .map((f) => ({
      label: f.label,
      count: items.filter((it) => {
        const u = it.usage;
        if (!u || f.match.length === 0) return false;
        const lower = u.toLowerCase();
        return f.match.some((m) => lower.includes(m.toLowerCase()));
      }).length,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/* ── 카드 데이터 정규화 ───────────────────────────────────── */
type AuctionCardData = {
  key: string;
  href: string;
  name: string;
  region: string;
  status: string | null;
  sample: boolean;
  dday: { label: string; urgent: boolean } | null;
  tags: string[];
  failLabel: string | null;
  minBidLabel: string;
  minBidValue: string;
  appraisalValue: string;
  dateLabel: string;
  dateValue: string;
};

function onbidToCard(a: AuctionItem): AuctionCardData {
  const href = a.onbidCltrno
    ? `https://www.onbid.co.kr/op/cta/cltrdtl/collateralDetailMoveableAssetsDetail.do?cltrHstrNo=${a.onbidCltrno}`
    : "https://www.onbid.co.kr";
  const tags: string[] = [];
  if (a.usage) tags.push(a.usage);
  if (a.bldSqms) tags.push(`건물 ${a.bldSqms}㎡`);
  if (a.landSqms) tags.push(`토지 ${a.landSqms}㎡`);
  return {
    key: a.externalKey,
    href,
    name: a.name ?? "물건",
    region: [a.sido, a.sigungu, a.emd].filter(Boolean).join(" "),
    status: a.status,
    sample: false,
    dday: ddayFrom(a.bidEnd),
    tags,
    failLabel: null,
    minBidLabel: "최저입찰가",
    minBidValue: fmtKrw(a.minBidKrw),
    appraisalValue: fmtKrw(a.appraisalKrw),
    dateLabel: "입찰마감",
    dateValue: fmtDt(a.bidEnd),
  };
}

function courtToCard(a: CourtAuctionItem): AuctionCardData {
  const tags: string[] = [];
  if (a.usage) tags.push(a.usage);
  if (a.courtName) tags.push(a.courtName);
  if (a.caseNo) tags.push(a.caseNo);
  return {
    key: a.externalKey,
    href: a.detailUrl ?? "https://www.courtauction.go.kr",
    name: a.name ?? "물건",
    region: [a.sido, a.sigungu, a.address].filter(Boolean).join(" "),
    status: a.status,
    sample: a.isSample,
    dday: ddayFrom(a.bidDate),
    tags,
    failLabel: a.failCount ? `유찰 ${a.failCount}회` : null,
    minBidLabel: "최저매각가",
    minBidValue: fmtKrw(a.minBidKrw),
    appraisalValue: fmtKrw(a.appraisalKrw),
    dateLabel: "매각기일",
    dateValue: fmtCourtDate(a.bidDate),
  };
}

/* ── 프레젠테이션 컴포넌트 ────────────────────────────────── */

/** 공매(온비드) ↔ 경매(법원) 소스 전환 탭 — 청약 센터 스타일의 강조 필 */
function SourceTabs({ active }: { active: "onbid" | "court" }) {
  const pill = (on: boolean) =>
    on
      ? "press rounded-full bg-primary px-4 py-2 text-[13px] font-bold no-underline"
      : "press glass rounded-full px-4 py-2 text-[13px] font-semibold text-text-2 no-underline";
  // a { color: var(--primary) } 가 text-white 유틸리티를 이겨서 활성 필 글자가 안 보이는 문제 →
  // 활성(채워진) 탭은 인라인 흰색으로 강제.
  const white = (on: boolean) => (on ? { color: "#fff" } : undefined);
  return (
    <div className="flex gap-1.5">
      <Link href="/auctions" style={white(active === "onbid")} className={pill(active === "onbid")}>
        공매(온비드)
      </Link>
      <Link
        href="/auctions?source=court"
        style={white(active === "court")}
        className={pill(active === "court")}
      >
        경매(법원)
      </Link>
    </div>
  );
}

/** 유형(용도) 필터 칩 */
function UsageFilterChips({
  filters,
  activeKey,
  baseHref,
}: {
  filters: { key: string; label: string }[];
  activeKey?: string;
  baseHref: string;
}) {
  const sep = baseHref.includes("?") ? "&" : "?";
  const chip = (on: boolean) =>
    on
      ? "chip-active px-3 py-1.5 text-xs no-underline"
      : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline";
  return (
    <section className="rise-in-1 mb-3 flex flex-wrap gap-1.5">
      <Link href={baseHref} className={chip(!activeKey)}>
        전체
      </Link>
      {filters.map((f) => (
        <Link
          key={f.key}
          href={`${baseHref}${sep}usage=${f.key}`}
          className={chip(activeKey === f.key)}
        >
          {f.label}
        </Link>
      ))}
    </section>
  );
}

/** 청약 센터형 물건 카드 — card/card-hover 행 + D-day 배지 + 감정가/최저가 */
function AuctionCard({ data }: { data: AuctionCardData }) {
  return (
    <a
      href={data.href}
      target="_blank"
      rel="noopener noreferrer"
      className="card card-hover press block p-4 no-underline"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="clamp-2 text-[13px] font-bold text-ink">{data.name}</div>
          {data.region ? (
            <div className="mt-1 text-[11px] text-text-3">{data.region}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {data.dday ? (
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white ${
                data.dday.urgent ? "bg-danger" : "bg-primary"
              }`}
            >
              {data.dday.label}
            </span>
          ) : null}
          {data.sample ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
            >
              예시
            </span>
          ) : null}
          {data.status ? (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
              {data.status}
            </span>
          ) : null}
        </div>
      </div>

      {data.tags.length > 0 || data.failLabel ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {data.tags.map((t, i) => (
            <span key={`${t}-${i}`} className="chip-tag px-2 py-0.5 text-[10px]">
              {t}
            </span>
          ))}
          {data.failLabel ? (
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold"
              style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
            >
              {data.failLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-end justify-between gap-2 border-t border-line pt-3">
        <div>
          <div className="text-[10px] text-text-3">{data.minBidLabel}</div>
          <div className="text-[16px] font-extrabold text-primary">{data.minBidValue}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-text-3">감정가</div>
          <div className="text-[12px] font-bold text-ink">{data.appraisalValue}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-text-3">{data.dateLabel}</div>
          <div className="text-[12px] font-bold text-ink">{data.dateValue}</div>
        </div>
      </div>
    </a>
  );
}

/** 우측 요약·인사이트 카드 — 이미 가져온 데이터에서 파생 */
function InsightAside({
  total,
  shown,
  dist,
  notifyLabel,
  sourceHref,
  sourceLabel,
}: {
  total: number;
  shown: number;
  dist: { label: string; count: number }[];
  notifyLabel: string;
  sourceHref: string;
  sourceLabel: string;
}) {
  const max = Math.max(1, ...dist.map((d) => d.count));
  return (
    <aside className="flex flex-col gap-3.5">
      <div className="rise-in-2 card flex flex-col gap-3 rounded-[18px] p-[18px]">
        <div className="text-[13px] font-extrabold text-ink">물건 요약</div>

        <div className="rounded-xl bg-primary-soft p-3.5">
          <div className="text-[11px] font-semibold text-primary">전체 물건수</div>
          <div className="mt-0.5 text-[22px] font-extrabold text-primary">
            {total.toLocaleString()}건
          </div>
          <div className="mt-0.5 text-[10px] text-text-3">
            현재 목록 표시 {shown.toLocaleString()}건
          </div>
        </div>

        {dist.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold text-text-2">현재 목록 용도 분포</div>
            {dist.map((d) => (
              <div key={d.label} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[11px] text-text-1">{d.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-soft">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((d.count / max) * 100)}%` }}
                  />
                </span>
                <span className="w-7 shrink-0 text-right text-[11px] font-bold text-ink">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] leading-[1.6] text-text-3">
            표시할 용도 분포가 아직 없어요.
          </p>
        )}

        <Link
          href="/notifications"
          className="btn-primary mt-1 block rounded-[10px] p-[11px] text-center text-xs no-underline"
        >
          {notifyLabel}
        </Link>
        <a
          href={sourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-[11px] font-bold text-primary no-underline"
        >
          {sourceLabel} ↗
        </a>
      </div>
    </aside>
  );
}

/** 두 소스가 공유하는 청약 센터형 레이아웃 (양쪽 브랜치 공통) */
function AuctionView({
  active,
  total,
  cards,
  filters,
  activeUsage,
  baseHref,
  listHeading,
  summary,
  banner,
  cta,
  emptyText,
  footNote,
  dist,
  notifyLabel,
  sourceHref,
  sourceLabel,
}: {
  active: "onbid" | "court";
  total: number;
  cards: AuctionCardData[];
  filters: { key: string; label: string }[];
  activeUsage?: string;
  baseHref: string;
  listHeading: string;
  summary: ReactNode;
  banner: ReactNode;
  cta: ReactNode;
  emptyText: string;
  footNote: ReactNode;
  dist: { label: string; count: number }[];
  notifyLabel: string;
  sourceHref: string;
  sourceLabel: string;
}) {
  return (
    <>
      {/* 상단 필 행: 소스 토글 + CTA 칩 */}
      <div className="rise-in mb-3 flex flex-wrap items-center gap-2">
        <SourceTabs active={active} />
        <div className="flex-1" />
        {cta}
      </div>

      {/* 유형 필터 */}
      <UsageFilterChips filters={filters} activeKey={activeUsage} baseHref={baseHref} />

      {/* 요약 라인 */}
      <p className="rise-in-1 mb-3 text-[13px] leading-[1.6] text-text-2">{summary}</p>

      {/* 소스 배너 · 면책 (보라 틴트) */}
      {banner}

      {/* 2단 레이아웃 (md+) */}
      <div className="grid gap-4 md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3">
          <div className="rise-in-1 flex items-center justify-between px-1">
            <span className="text-xs font-extrabold text-ink">{listHeading}</span>
            <span className="text-[11px] text-text-3">{cards.length.toLocaleString()}건 표시</span>
          </div>

          {cards.length === 0 ? (
            <section className="rise-in-2 card p-[var(--pad-card)]">
              <div className="rounded-[12px] border border-line bg-surface px-4 py-12 text-center text-[13px] text-text-3">
                {emptyText}
              </div>
            </section>
          ) : (
            <section className="rise-in-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {cards.map((c) => (
                <AuctionCard key={c.key} data={c} />
              ))}
            </section>
          )}

          <p className="rise-in-3 mt-1 px-1 text-[11px] leading-[1.6] text-text-3">{footNote}</p>
        </div>

        <InsightAside
          total={total}
          shown={cards.length}
          dist={dist}
          notifyLabel={notifyLabel}
          sourceHref={sourceHref}
          sourceLabel={sourceLabel}
        />
      </div>
    </>
  );
}

/* ── 페이지 (Server Component) ────────────────────────────── */
export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<{ usage?: string; gu?: string; source?: string }>;
}) {
  const { usage, gu, source } = await searchParams;

  // 법원경매(court) 소스 — 예시 스캐폴드
  if (source === "court") {
    const [items, total] = await Promise.all([
      getCourtAuctions({ usage, sigungu: gu, limit: 120 }),
      getCourtAuctionCount(),
    ]);
    const cards = items.map(courtToCard);
    const dist = usageDistribution(items, COURT_USAGE_FILTERS);

    return (
      <PageShell breadcrumb="동네이야기 › 공매·경매" wide>
        <div style={AUCTION_THEME}>
          <AuctionView
            active="court"
            total={total}
            cards={cards}
            filters={COURT_USAGE_FILTERS}
            activeUsage={usage}
            baseHref="/auctions?source=court"
            listHeading="법원경매 물건 목록"
            summary={
              <>
                법원 부동산경매(<strong className="text-ink">법원경매</strong>) 물건{" "}
                <strong className="text-ink">{total.toLocaleString()}건</strong> — 감정가·최저매각가격·매각기일은
                참고용 예시 데이터입니다.
              </>
            }
            banner={
              <p className="rise-in-1 mb-5 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6] text-primary">
                법원경매 정보는 데이터 소스 연결 전 참고용 <strong className="font-bold">예시(스캐폴드)</strong>예요.
                실제 입찰 전 대법원 법원경매정보(courtauction.go.kr)에서 매각조건을 반드시 확인하세요.
              </p>
            }
            cta={
              <div className="flex gap-1.5 text-xs">
                <a
                  href="https://www.courtauction.go.kr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press glass rounded-full px-3.5 py-2 font-bold text-primary no-underline"
                >
                  법원경매정보 ↗
                </a>
                <Link
                  href="/notifications"
                  className="press rounded-full bg-primary-soft px-3.5 py-2 font-bold text-primary no-underline"
                >
                  경매 알림 받기
                </Link>
              </div>
            }
            emptyText="현재 조건의 법원경매 물건이 없어요."
            footNote="출처: 데이터 소스 연결 전 예시(스캐폴드) · 권리분석·명도·정확한 매각조건은 대법원 법원경매정보(courtauction.go.kr) 원문과 전문가 확인이 필요합니다."
            dist={dist}
            notifyLabel="경매 알림 받기"
            sourceHref="https://www.courtauction.go.kr"
            sourceLabel="법원경매정보 바로가기"
          />
        </div>
      </PageShell>
    );
  }

  // 온비드 공매(기본)
  const [items, total] = await Promise.all([
    getAuctions({ usage, sigungu: gu, limit: 120 }),
    getAuctionCount(),
  ]);
  const cards = items.map(onbidToCard);
  const dist = usageDistribution(items, AUCTION_USAGE_FILTERS);

  return (
    <PageShell breadcrumb="동네이야기 › 공매·경매" wide>
      <div style={AUCTION_THEME}>
        <AuctionView
          active="onbid"
          total={total}
          cards={cards}
          filters={AUCTION_USAGE_FILTERS}
          activeUsage={usage}
          baseHref="/auctions"
          listHeading="공매 물건 목록"
          summary={
            <>
              한국자산관리공사 <strong className="text-ink">온비드</strong> 공매 부동산 — 입찰 중·예정 물건{" "}
              <strong className="text-ink">{total.toLocaleString()}건</strong>. 감정가·최저입찰가·입찰일정은
              공공 데이터 기준입니다.
            </>
          }
          banner={
            <p className="rise-in-1 mb-5 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6] text-primary">
              온비드 공매 부동산의 감정가·최저입찰가·입찰일정은 <strong className="font-bold">공공 데이터</strong>{" "}
              기준이에요. 실제 입찰·명도 조건은 온비드 공고 원문을 반드시 확인하세요.
            </p>
          }
          cta={
            <div className="flex gap-1.5 text-xs">
              <a
                href="https://www.onbid.co.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="press glass rounded-full px-3.5 py-2 font-bold text-primary no-underline"
              >
                온비드 바로가기 ↗
              </a>
              <Link
                href="/notifications"
                className="press rounded-full bg-primary-soft px-3.5 py-2 font-bold text-primary no-underline"
              >
                공매 알림 받기
              </Link>
            </div>
          }
          emptyText="현재 조건의 공매 물건이 없어요. 데이터는 하루 2회 자동 갱신됩니다."
          footNote="출처: 한국자산관리공사 온비드(공공데이터포털) · 참고용 정보이며 권리분석·명도·정확한 입찰조건은 온비드 공고 원문과 전문가 확인이 필요합니다."
          dist={dist}
          notifyLabel="공매 알림 받기"
          sourceHref="https://www.onbid.co.kr"
          sourceLabel="온비드 바로가기"
        />
      </div>
    </PageShell>
  );
}
