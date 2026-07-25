import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";
import { ExampleBadge } from "@/app/components/ExampleBadge";
import { AdSlot } from "@/app/components/ads/AdSlot";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
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
/** "20260815"·"2026-08-15" 등 문자열 → Date. 형식 불명이면 null. */
function parseDigitsDate(v: string | null): Date | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const y = Number(digits.slice(0, 4));
  const mo = Number(digits.slice(4, 6));
  const da = Number(digits.slice(6, 8));
  if (!y || !mo || !da) return null;
  const d = new Date(y, mo - 1, da);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** 매각기일·입찰마감 문자열 → D-day 배지. 지난 일정·형식 불명이면 null. */
function ddayFrom(v: string | null): { label: string; urgent: boolean } | null {
  const target = parseDigitsDate(v);
  if (!target) return null;
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

/** 청약 캘린더 형태의 월 그리드 — 표시 물건의 입찰마감/매각기일 셀을 마킹.
 *  마크가 있는 가장 이른 예정일을 기준 월로 잡아 대표 셀을 노출한다. */
type CalCell = { day: number; muted: boolean; mark: boolean };
function buildCalendar(dates: (string | null)[]): { monthLabel: string; cells: CalCell[] } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parsed = dates
    .map(parseDigitsDate)
    .filter((d): d is Date => d !== null);
  const future = parsed
    .filter((d) => d.getTime() >= today.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  const anchor = future.length > 0 ? future[0] : today;
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const marked = new Set<number>();
  for (const d of parsed) {
    if (d.getFullYear() === year && d.getMonth() === month) marked.add(d.getDate());
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 월요일 시작
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: CalCell[] = [];
  for (let i = firstWeekday; i > 0; i--) {
    cells.push({ day: prevMonthDays - i + 1, muted: true, mark: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, muted: false, mark: marked.has(d) });
  }
  let trail = 1;
  while (cells.length % 7 !== 0) cells.push({ day: trail++, muted: true, mark: false });
  return { monthLabel: `${month + 1}월`, cells };
}

/* ── 카드 데이터 정규화 ───────────────────────────────────── */
type AuctionCardData = {
  key: string;
  href: string;
  name: string;
  region: string;
  usage: string | null;
  status: string | null;
  sample: boolean;
  targetDate: string | null;
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
    usage: a.usage,
    status: a.status,
    sample: false,
    targetDate: a.bidEnd,
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
    usage: a.usage,
    status: a.status,
    sample: a.isSample,
    targetDate: a.bidDate,
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

/** AdSense 자리 (청약 센터와 동일 플레이스홀더) */
/* H1 — 이 자리에는 "AD / AdSense 320×64" 라고 적힌 점선 상자가 있었다.
   개발용 자리표시자가 그대로 프로덕션에 나가 있던 것으로, 사용자에게는
   광고가 실릴 자리가 아니라 **깨진 광고**로 보인다. 실제 슬롯
   (`app/components/ads/AdSlot.tsx`)으로 교체한다 — 등록 배너가 있으면 배너를,
   없으면 하우스 광고를, 둘 다 없으면 `null` 을 반환해 **빈 상자를 남기지 않는다.** */

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

/** 유형(용도) 필터 칩 — 상단 필 행에 인라인 배치 */
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
  // 채워진(활성) 칩 = chip-active. a{color} 가 흰 글자를 덮지 않도록 인라인 흰색 강제.
  const chip = (on: boolean) =>
    on
      ? "chip-active px-3 py-1.5 text-xs no-underline"
      : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2 no-underline";
  const white = (on: boolean) => (on ? { color: "#fff" } : undefined);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Link href={baseHref} style={white(!activeKey)} className={chip(!activeKey)}>
        전체
      </Link>
      {filters.map((f) => (
        <Link
          key={f.key}
          href={`${baseHref}${sep}usage=${f.key}`}
          style={white(activeKey === f.key)}
          className={chip(activeKey === f.key)}
        >
          {f.label}
        </Link>
      ))}
    </div>
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
  summary,
  banner,
  cta,
  emptyText,
  footNote,
  dist,
  notifyLabel,
  sourceHref,
  sourceLabel,
  dateColLabel,
  tableHeading,
  tableCaption,
}: {
  active: "onbid" | "court";
  total: number;
  cards: AuctionCardData[];
  filters: { key: string; label: string }[];
  activeUsage?: string;
  baseHref: string;
  summary: ReactNode;
  banner: ReactNode;
  cta: ReactNode;
  emptyText: string;
  footNote: ReactNode;
  dist: { label: string; count: number }[];
  notifyLabel: string;
  sourceHref: string;
  sourceLabel: string;
  dateColLabel: string;
  tableHeading: ReactNode;
  tableCaption: ReactNode;
}) {
  const withDday = cards.filter((c) => c.dday !== null);
  const imminent = withDday.filter((c) => c.dday?.urgent).slice(0, 4);
  const ongoing = withDday.filter((c) => !c.dday?.urgent).slice(0, 6);
  const { monthLabel, cells } = buildCalendar(cards.map((c) => c.targetDate));
  const max = Math.max(1, ...dist.map((d) => d.count));
  const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

  return (
    <>
      {/* 상단 필 행: 소스 토글 + 용도 필터 + CTA 칩 (우측 정렬) */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
        <SourceTabs active={active} />
        <UsageFilterChips filters={filters} activeKey={activeUsage} baseHref={baseHref} />
        <div className="flex-1" />
        {cta}
      </div>

      {/* 요약 라인 */}
      <p className="rise-in mb-3 text-[13px] leading-[1.6] text-text-2">{summary}</p>

      {/* 정직 안내 · 면책 (보라 틴트) */}
      {banner}

      {/* 2단 레이아웃 (청약 센터와 동일 구조) */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-3">
          {/* a) 입찰 캘린더 카드 */}
          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between">
              {/* 캘린더·인사이트·용도분포는 모두 아래 목록(cards/dist)에서 파생된 값이다.
                  온비드는 공공데이터포털 실데이터이므로 "예시" 라벨을 떼었다 — 실데이터를
                  예시라고 부르는 것도 사실과 다르다. 법원경매처럼 목록이 비면 표시도 빈다. */}
              <span className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                {monthLabel} 입찰 캘린더
              </span>
              <div className="flex gap-2.5 text-[11px]">
                <span className="flex items-center gap-1 text-text-2">
                  <span className="h-2 w-2 rounded-[2px] bg-primary" />
                  입찰/매각일
                </span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-text-3">
              {weekdays.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c, i) => (
                <div
                  key={i}
                  className={`h-11 rounded-lg px-1.5 py-1 text-[10px] ${
                    c.mark
                      ? "border border-line bg-primary-soft text-text-1"
                      : c.muted
                        ? "bg-bg text-[#c7ced8]"
                        : "bg-bg text-text-3"
                  }`}
                >
                  {c.day}
                  {c.mark && <div className="mt-0.5 h-1.5 rounded-[2px] bg-primary" />}
                </div>
              ))}
            </div>
          </div>

          {/* b) 진행 중 물건 */}
          {ongoing.length > 0 && (
            <>
              <div className="rise-in-2 px-1 text-xs font-extrabold text-primary">
                진행 중 물건 ({ongoing.length}건)
              </div>
              {ongoing.map((c) => (
                <div
                  key={c.key}
                  className="rise-in-2 flex flex-col gap-3 rounded-2xl border-[1.5px] border-primary bg-surface px-[18px] py-3.5 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {c.dday && (
                      <span
                        className={`rounded-md px-2 py-1 text-[11px] font-extrabold text-white ${
                          c.dday.urgent ? "bg-danger" : "bg-primary"
                        }`}
                      >
                        {c.dday.label}
                      </span>
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold text-ink">
                        {c.name}
                        {c.usage && (
                          <span className="rounded bg-primary-soft px-[7px] py-0.5 text-[10px] font-extrabold text-primary">
                            {c.usage}
                          </span>
                        )}
                        {c.sample && <ExampleBadge />}
                      </div>
                      <div className="text-[11px] text-text-3">
                        {[c.region, c.failLabel].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3.5">
                    <div className="text-right">
                      <div className="text-[11px] text-text-3">감정가</div>
                      <div className="text-[13px] font-extrabold text-ink">{c.appraisalValue}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-text-3">{c.minBidLabel}</div>
                      <div className="text-[13px] font-extrabold text-primary">{c.minBidValue}</div>
                    </div>
                    <a
                      href={c.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#fff" }}
                      className="btn-primary rounded-[10px] px-4 py-[9px] text-xs no-underline"
                    >
                      상세 ↗
                    </a>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* c) 마감 임박 / 예정 (선택) */}
          {imminent.length > 0 && (
            <>
              <div className="rise-in-3 px-1 pt-1.5 text-xs font-extrabold text-danger">
                마감 임박 / 예정 ({imminent.length}건)
              </div>
              {imminent.map((c) => (
                <div
                  key={c.key}
                  className="rise-in-3 card flex items-center justify-between rounded-2xl px-[18px] py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-md bg-danger px-2 py-1 text-[11px] font-extrabold text-white">
                      {c.dday?.label}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold text-ink">
                        {c.name}
                        {c.usage && (
                          <span className="rounded bg-primary-soft px-[7px] py-0.5 text-[10px] font-extrabold text-primary">
                            {c.usage}
                          </span>
                        )}
                        {c.sample && <ExampleBadge />}
                      </div>
                      <div className="text-[11px] text-text-3">
                        {c.region || "—"} · {c.minBidLabel} {c.minBidValue}
                      </div>
                    </div>
                  </div>
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-[10px] bg-primary-soft px-4 py-[9px] text-xs font-bold text-primary no-underline"
                  >
                    상세 ›
                  </a>
                </div>
              ))}
            </>
          )}

          {/* d) 전체 물건 표 (청약 센터 실데이터 표 형태) */}
          <div className="rise-in-4 px-1 pt-1.5 text-xs font-extrabold text-text-3">{tableHeading}</div>
          {cards.length === 0 ? (
            <div className="rise-in-4 card p-[var(--pad-card)]">
              <div className="rounded-[12px] border border-line bg-surface px-4 py-12 text-center text-[13px] text-text-3">
                {emptyText}
              </div>
            </div>
          ) : (
            <div className="rise-in-4 card overflow-x-auto rounded-2xl px-[18px] py-1">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] gap-2 border-b border-[#f0f3f8] py-2 text-[10px] text-text-3">
                  <span>물건 · 소재지</span>
                  <span className="text-center">용도</span>
                  <span className="text-center">감정가</span>
                  <span className="text-center">최저가</span>
                  <span className="text-center">{dateColLabel}</span>
                </div>
                {cards.slice(0, 24).map((c, i, arr) => (
                  <div
                    key={c.key}
                    className={`grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] items-center gap-2 py-2.5 text-xs ${
                      i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
                    }`}
                  >
                    <span className="truncate-1 font-bold text-ink">
                      {c.name}
                      {c.region ? (
                        <span className="ml-1 text-[10px] font-medium text-text-3">{c.region}</span>
                      ) : null}
                    </span>
                    <span className="truncate-1 text-center font-bold text-text-1">
                      {c.usage ?? "—"}
                    </span>
                    <span className="text-center font-bold text-text-1">{c.appraisalValue}</span>
                    <span className="text-center font-extrabold text-primary">{c.minBidValue}</span>
                    <span className="text-center font-bold text-text-1">{c.dateValue}</span>
                  </div>
                ))}
                <div className="pb-2 pt-1 text-[10px] text-text-3">{tableCaption}</div>
              </div>
            </div>
          )}

          <p className="rise-in-4 mt-1 px-1 text-[11px] leading-[1.6] text-text-3">{footNote}</p>
        </div>

        {/* 우측 사이드 (청약 센터와 동일 구성) */}
        <aside className="flex flex-col gap-3.5">
          {/* a) AI 인사이트 — 표시 데이터에서 파생 */}
          <div className="rise-in-2">
            <AIPanel title="공매·경매 인사이트" className="rounded-[18px]">
              <div className="mb-1.5 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                <span className="text-ai-muted">전체 물건수</span>
                <span className="font-extrabold text-white">{total.toLocaleString()}건</span>
              </div>
              <div className="mb-2 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                <span className="text-ai-muted">현재 목록 표시</span>
                <span className="font-extrabold text-[#a78bfa]">{cards.length.toLocaleString()}건</span>
              </div>
              {dist.length > 0 ? (
                <>
                  현재 목록에서 <b className="text-[#a78bfa]">{dist[0].label}</b>이(가){" "}
                  {dist[0].count}건으로 가장 많아요. 실입찰 전 공고 원문에서 권리·명도 조건을 반드시
                  확인하세요.
                </>
              ) : (
                <>
                  현재 조건에 표시할 물건이 없어요. 데이터가 연동·갱신되면 용도 분포·인사이트가
                  자동으로 채워집니다.
                </>
              )}
              <Link
                href="/notifications"
                style={{ color: "#fff" }}
                className="btn-primary mt-2.5 block rounded-[10px] p-[11px] text-center text-xs no-underline"
              >
                {notifyLabel}
              </Link>
            </AIPanel>
          </div>

          {/* b) 용도별 요약 — 용도 필터/카운트 기반 */}
          <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
              용도별 요약
            </div>
            {dist.length > 0 ? (
              dist.map((d) => (
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
              ))
            ) : (
              <p className="text-[10px] leading-[1.6] text-text-3">
                표시할 용도 분포가 아직 없어요. 데이터가 연동되면 자동으로 채워집니다.
              </p>
            )}
            <a
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 text-[11px] font-bold text-primary no-underline"
            >
              {sourceLabel} ↗
            </a>
          </div>

          {/* c) 광고 자리 */}
          <div className="rise-in-4">
            <AdSlot placement="community_feed" seed={0} plan={null} />
          </div>
        </aside>
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

  /* 법원경매(court) 소스 — 대법원 법원경매정보 미연동 상태.
     사실 우선: 예전에는 court_auctions 의 예시 행("2025타경12345 · 서울북부지방법원 ·
     감정가 8.2억 · 매각기일 2026-08-12")을 그대로 띄우고 화면 곳곳에 "예시" 배지를 달았다.
     경매는 감정가·최저매각가격·매각기일이 곧 입찰 판단이라 배지로 감당할 수 있는 종류가
     아니라, store 에서 is_sample 행을 걷어냈다(lib/court-auction/store.ts).
     그래서 이 화면의 문구도 "표시된 숫자가 예시"가 아니라 "소스가 아직 연결되지 않았다"로
     바꿨다 — 목록은 비어 있고, 비어 있다고 말한다. */
  if (source === "court") {
    const [items, total] = await Promise.all([
      getCourtAuctions({ usage, sigungu: gu, limit: 120 }),
      getCourtAuctionCount(),
    ]);
    const cards = items.map(courtToCard);
    const dist = usageDistribution(items, COURT_USAGE_FILTERS);

    return (
      <PageShell breadcrumb="동네이야기 › 공매·경매" wide>
        {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
        <TownCategoryNav stick />
        <div style={AUCTION_THEME}>
          <AuctionView
            active="court"
            total={total}
            cards={cards}
            filters={COURT_USAGE_FILTERS}
            activeUsage={usage}
            baseHref="/auctions?source=court"
            summary={
              <>
                법원 부동산경매(<strong className="text-ink">법원경매</strong>) —{" "}
                <strong className="text-ink">대법원 법원경매정보 연동 준비 중</strong>이라 아직
                표시할 물건이 없어요. 공매(온비드)는 실데이터로 보실 수 있어요.
              </>
            }
            banner={
              <div className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6] text-primary">
                <ExampleBadge label="미연동" />
                <span>
                  법원경매는 <b className="font-bold">아직 데이터 소스가 연결되지 않았어요.</b>{" "}
                  사건번호·감정가·최저매각가격·매각기일은 지어내지 않고 비워 둡니다. 지금 물건을
                  찾으신다면 대법원{" "}
                  <a
                    href="https://www.courtauction.go.kr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-primary underline"
                  >
                    법원경매정보(courtauction.go.kr)
                  </a>
                  에서 확인하세요.
                </span>
              </div>
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
            emptyText="대법원 법원경매정보 연동 전이라 표시할 물건이 없어요. 공매(온비드) 탭은 실데이터로 운영 중이에요."
            footNote="법원경매는 대법원 법원경매정보(courtauction.go.kr) 연동 준비 중입니다 · 권리분석·명도·정확한 매각조건은 언제나 원문과 전문가 확인이 필요합니다."
            dist={dist}
            notifyLabel="경매 알림 받기"
            sourceHref="https://www.courtauction.go.kr"
            sourceLabel="법원경매정보 바로가기"
            dateColLabel="매각기일"
            tableHeading={`전체 물건 · 법원경매 ${total.toLocaleString()}건`}
            tableCaption="출처: 대법원 법원경매정보(courtauction.go.kr)"
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
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />
      <div style={AUCTION_THEME}>
        <AuctionView
          active="onbid"
          total={total}
          cards={cards}
          filters={AUCTION_USAGE_FILTERS}
          activeUsage={usage}
          baseHref="/auctions"
          summary={
            <>
              한국자산관리공사 <strong className="text-ink">온비드</strong> 공매 부동산 — 입찰
              중·예정 물건 <strong className="text-ink">{total.toLocaleString()}건</strong>.
              감정가·최저입찰가·입찰일정은 공공 데이터 기준입니다.
            </>
          }
          banner={
            <div className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6] text-primary">
              <span>
                {/* 캘린더·인사이트도 아래 목록(온비드 실데이터)에서 파생된 값이라
                    "예시 화면"이라는 안내를 뺐다 — 실데이터를 예시라고 부르는 것도 사실과 다르다.
                    대신 남겨야 할 진짜 주의사항(갱신 주기·원문 확인)을 앞에 세운다. */}
                감정가·최저입찰가·입찰일정은 <b className="font-bold">공공 데이터</b> 기준이며 하루
                2회 갱신됩니다. 갱신 사이에 변경·취소될 수 있으니 실제 입찰·명도 조건은{" "}
                <a
                  href="https://www.onbid.co.kr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-primary underline"
                >
                  온비드(onbid.co.kr)
                </a>{" "}
                공고 원문을 반드시 확인하세요.
              </span>
            </div>
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
          dateColLabel="입찰마감"
          tableHeading={`전체 물건 · 온비드 실데이터 ${total.toLocaleString()}건`}
          tableCaption="출처: 한국자산관리공사 온비드(공공데이터포털) · 하루 2회 자동 갱신"
        />
      </div>
    </PageShell>
  );
}
