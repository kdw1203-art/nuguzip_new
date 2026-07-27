import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";
import { ExampleBadge } from "@/app/components/ExampleBadge";
import { AdSlot } from "@/app/components/ads/AdSlot";
import { getAdViewer } from "@/lib/ads/viewer";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import {
  getAuctions,
  getActiveAuctionCount,
  isPastBidEnd,
  AUCTION_USAGE_FILTERS,
  type AuctionItem,
} from "@/lib/onbid/store";
import { seoAlternates } from "@/lib/seo/alternates";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "서울 공매 물건 (온비드) | 누구집",
  description:
    "한국자산관리공사 온비드 공매 부동산 — 서울권 아파트·오피스텔·빌라 감정가·최저입찰가·입찰일정. 공공 데이터 기반.",
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/auctions"),
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
/** 입찰마감 문자열 → D-day 배지. 지난 일정·형식 불명이면 null. */
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

/** 진행·예정 물건의 자치구 분포 — 죽어 있던 `gu` 파라미터를 실제로 세팅하는 링크 재료 */
function sigunguDistribution(
  items: { sigungu: string | null }[],
): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const s = it.sigungu?.trim();
    if (!s) continue;
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

/** 청약 캘린더 형태의 월 그리드 — 표시 물건의 입찰마감 셀을 마킹.
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
  targetDate: string | null;
  dday: { label: string; urgent: boolean } | null;
  minBidValue: string;
  appraisalValue: string;
  dateValue: string;
};

/**
 * 온비드 링크 조립 근거 (2026-07 확인):
 * - 예전 링크는 동산(moveable) 상세(collateralDetailMoveableAssetsDetail.do)에
 *   잘못된 파라미터(cltrHstrNo=onbidCltrno)를 붙인 것이라 부동산 물건이 열리지 않았다.
 * - 리뉴얼 온비드의 부동산 상세는 /op/cltrpbancinf/cltrdtl/CltrDtlController/mvmnCltrDtl.do
 *   인데 cltrHisNo·onbidPbancNo·cltrScrnGrpCd 등 우리 DB에 없는 파라미터가 필요하고,
 *   일부만 넘기면 400 을 반환하는 것을 확인했다 → 상세 URL 직조립은 하지 않는다.
 * - 대신 온비드 통합검색 결과 페이지(mvmnUnfSrchClg.do — 온비드 메인 검색 폼이
 *   제출하는 실제 엔드포인트, GET 동작 200 확인)에 물건관리번호를 검색어로 넘기는
 *   안전한 링크를 쓴다. 번호가 없으면 온비드 메인으로 폴백.
 */
const ONBID_SEARCH_URL =
  "https://www.onbid.co.kr/op/cltrpbancinf/toppagemng/unfsrch/UnfSrchController/mvmnUnfSrchClg.do";
function onbidSearchHref(a: AuctionItem): string {
  const keyword = a.cltrMngNo ?? a.onbidCltrno;
  if (!keyword) return "https://www.onbid.co.kr";
  const params = new URLSearchParams({ swd: keyword, srvcDiv: "search", bfhdDiv: "Y" });
  return `${ONBID_SEARCH_URL}?${params.toString()}`;
}

function onbidToCard(a: AuctionItem): AuctionCardData {
  return {
    key: a.externalKey,
    href: onbidSearchHref(a),
    name: a.name ?? "물건",
    region: [a.sido, a.sigungu, a.emd].filter(Boolean).join(" "),
    usage: a.usage,
    status: a.status,
    targetDate: a.bidEnd,
    dday: ddayFrom(a.bidEnd),
    minBidValue: fmtKrw(a.minBidKrw),
    appraisalValue: fmtKrw(a.appraisalKrw),
    dateValue: fmtDt(a.bidEnd),
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

/* ── 법원경매 탭 — 데이터 연동 준비 중 안내 한 장 ──────────── */
/* 정직화: court-auction 소스는 미구현 스텁(lib/court-auction/sync.ts)이라 목록이
   항상 비어 있다. 예전에는 그 빈 데이터 위에 필터 칩 6개·캘린더·용도 요약까지
   그대로 렌더링했는데, 동작하지 않는 필터와 마크 없는 캘린더는 장식일 뿐이라
   전부 걷어내고 "준비 중" 안내 카드 하나로 축소했다. 탭 자체는 유지한다. */
function CourtAuctionPlaceholder() {
  return (
    <>
      <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
        <SourceTabs active="court" />
      </div>
      <div className="rise-in-1 card flex flex-col items-center gap-4 rounded-2xl px-6 py-12 text-center">
        <ExampleBadge label="준비 중" />
        <div className="flex flex-col gap-1.5">
          <p className="text-[15px] font-extrabold text-ink">
            법원경매는 데이터 연동 준비 중이에요
          </p>
          <p className="mx-auto max-w-[480px] text-[13px] leading-[1.7] text-text-2">
            대법원 법원경매정보 데이터 소스가 아직 연결되지 않아 표시할 물건이
            없어요. 사건번호·감정가·최저매각가격·매각기일은 지어내지 않고 비워
            둡니다. 공매(온비드) 탭은 실데이터로 운영 중이에요.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          <a
            href="https://www.courtauction.go.kr"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#fff" }}
            className="btn-primary press rounded-[10px] px-4 py-[9px] no-underline"
          >
            대법원 법원경매정보 ↗
          </a>
          <Link
            href="/auctions"
            className="press rounded-[10px] bg-primary-soft px-4 py-[9px] font-bold text-primary no-underline"
          >
            공매(온비드) 실데이터 보기
          </Link>
          <Link
            href="/my/saved-searches"
            className="press rounded-[10px] bg-primary-soft px-4 py-[9px] font-bold text-primary no-underline"
          >
            저장 검색으로 알림 받기
          </Link>
        </div>
        <p className="text-[11px] leading-[1.6] text-text-3">
          연동이 완료되면 이 탭에서 물건 목록·매각기일을 볼 수 있어요.
        </p>
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
  // 유료 플랜 광고 제거(H4) — 이 페이지는 force-dynamic 이라 세션을 읽어도 비용이 없다
  const viewer = await getAdViewer();

  if (source === "court") {
    return (
      <PageShell breadcrumb="동네이야기 › 공매·경매" wide>
        {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
        <TownCategoryNav stick />
        <div style={AUCTION_THEME}>
          <CourtAuctionPlaceholder />
        </div>
      </PageShell>
    );
  }

  // 온비드 공매(기본)
  /* 2026-07-26: store 가 실패 때 `[]`·`0` 을 돌려주던 걸 던지도록 고쳤다.
     여기서 받아서 "지금 불러오지 못했다"고 말한다 — 물건이 0건인 것과 조회가
     죽은 것을 같은 화면으로 그리면 안 된다. */
  const loaded = await Promise.all([
    getAuctions({ usage, sigungu: gu, limit: 200 }),
    getActiveAuctionCount(),
  ]).then(
    ([items, activeTotal]) => ({ ok: true as const, items, activeTotal }),
    (err: unknown) => {
      logger.error("[auctions] 온비드 공매 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );

  if (!loaded.ok) {
    return (
      <PageShell breadcrumb="동네이야기 › 공매·경매" wide>
        <TownCategoryNav stick />
        <div style={AUCTION_THEME}>
          <ErrorState
            title="공매 물건을 지금 불러오지 못했어요"
            desc="진행 중인 물건이 0건인 게 아니라 조회 자체가 실패했습니다. 잠시 후 새로고침해 주세요. 급하시면 온비드에서 직접 확인하실 수 있어요."
            cause={loaded.cause}
            action={{ href: "https://www.onbid.co.kr", label: "온비드 바로가기" }}
          />
        </div>
      </PageShell>
    );
  }

  const { items, activeTotal } = loaded;

  // 지난 물건 정리: 목록·표는 마감 전(진행·예정)만, 마감분은 접힌 섹션으로 분리.
  // store 정렬(bid_end 오름차순)이 곧 마감 임박순. 마감일 미상은 지난 것으로
  // 단정할 수 없어 진행 목록에 남긴다(날짜 "—" 표기).
  const now = new Date();
  const activeItems = items.filter((it) => !isPastBidEnd(it.bidEnd, now));
  const pastItems = items
    .filter((it) => isPastBidEnd(it.bidEnd, now))
    .sort((a, b) => (b.bidEnd ?? "").localeCompare(a.bidEnd ?? ""))
    .slice(0, 8);

  const cards = activeItems.map(onbidToCard);
  const pastCards = pastItems.map(onbidToCard);
  const dist = usageDistribution(activeItems, AUCTION_USAGE_FILTERS);
  const guDist = sigunguDistribution(activeItems);
  const max = Math.max(1, ...dist.map((d) => d.count));

  const withDday = cards.filter((c) => c.dday !== null);
  const imminent = withDday.filter((c) => c.dday?.urgent).slice(0, 4);
  const ongoing = withDday.filter((c) => !c.dday?.urgent).slice(0, 6);
  const { monthLabel, cells } = buildCalendar(cards.map((c) => c.targetDate));
  const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

  const guQuery = (name: string) => {
    const p = new URLSearchParams();
    if (usage) p.set("usage", usage);
    p.set("gu", name);
    return `/auctions?${p.toString()}`;
  };

  return (
    <PageShell breadcrumb="동네이야기 › 공매·경매" wide>
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />
      <div style={AUCTION_THEME}>
        {/* 상단 필 행: 소스 토글 + 용도 필터 + CTA 칩 (우측 정렬) */}
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
          <SourceTabs active="onbid" />
          <UsageFilterChips
            filters={AUCTION_USAGE_FILTERS}
            activeKey={usage}
            baseHref={gu ? `/auctions?gu=${encodeURIComponent(gu)}` : "/auctions"}
          />
          <div className="flex-1" />
          <div className="flex gap-1.5 text-xs">
            <a
              href="https://www.onbid.co.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="press glass rounded-full px-3.5 py-2 font-bold text-primary no-underline"
            >
              온비드 바로가기 ↗
            </a>
            {/* 알림 CTA — 실기능인 저장 검색(공매·경매 scope)으로 연결.
                예전 /notifications 은 알림함(수신함)이라 여기서 알림을 "설정"할 수 없었다. */}
            <Link
              href="/my/saved-searches"
              className="press rounded-full bg-primary-soft px-3.5 py-2 font-bold text-primary no-underline"
            >
              저장 검색으로 알림 받기
            </Link>
          </div>
        </div>

        {/* 요약 라인 — 마감분을 뺀 진행·예정 건수만 말한다 */}
        <p className="rise-in mb-3 text-[13px] leading-[1.6] text-text-2">
          한국자산관리공사 <strong className="text-ink">온비드</strong> 공매 부동산 — 입찰
          중·예정 물건 <strong className="text-ink">{activeTotal.toLocaleString()}건</strong>.
          감정가·최저입찰가·입찰일정은 공공 데이터 기준입니다.
        </p>

        {/* 정직 안내 · 면책 (보라 틴트) */}
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6] text-primary">
          <span>
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

        {/* 2단 레이아웃 (청약 센터와 동일 구조) */}
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-3">
            {/* a) 입찰 캘린더 카드 — 아래 진행·예정 목록에서 파생된 실데이터 마킹 */}
            <div className="rise-in-1 card flex flex-col gap-2.5 rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                  {monthLabel} 입찰 캘린더
                </span>
                <div className="flex gap-2.5 text-[11px]">
                  <span className="flex items-center gap-1 text-text-2">
                    <span className="h-2 w-2 rounded-[2px] bg-primary" />
                    입찰마감일
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
                        </div>
                        <div className="text-[11px] text-text-3">{c.region || "—"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3.5">
                      <div className="text-right">
                        <div className="text-[11px] text-text-3">감정가</div>
                        <div className="text-[13px] font-extrabold text-ink">{c.appraisalValue}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-text-3">최저입찰가</div>
                        <div className="text-[13px] font-extrabold text-primary">{c.minBidValue}</div>
                      </div>
                      <a
                        href={c.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#fff" }}
                        className="btn-primary rounded-[10px] px-4 py-[9px] text-xs no-underline"
                      >
                        온비드 검색 ↗
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
                      <span className="rounded-md bg-danger-fill px-2 py-1 text-[11px] font-extrabold text-white">
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
                        </div>
                        <div className="text-[11px] text-text-3">
                          {c.region || "—"} · 최저입찰가 {c.minBidValue}
                        </div>
                      </div>
                    </div>
                    <a
                      href={c.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-[10px] bg-primary-soft px-4 py-[9px] text-xs font-bold text-primary no-underline"
                    >
                      온비드 검색 ›
                    </a>
                  </div>
                ))}
              </>
            )}

            {/* d) 진행·예정 물건 표 — 마감(지난) 공고는 아래 접힌 섹션으로 분리 */}
            <div className="rise-in-4 px-1 pt-1.5 text-xs font-extrabold text-text-3">
              진행·예정 물건 · 온비드 실데이터 {activeTotal.toLocaleString()}건
            </div>
            {cards.length === 0 ? (
              <div className="rise-in-4 card p-[var(--pad-card)]">
                <div className="rounded-[12px] border border-line bg-surface px-4 py-12 text-center text-[13px] text-text-3">
                  현재 조건의 진행·예정 공매 물건이 없어요. 데이터는 하루 2회 자동
                  갱신됩니다.
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
                    <span className="text-center">입찰마감</span>
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
                  <div className="pb-2 pt-1 text-[10px] text-text-3">
                    마감 임박순 · 출처: 한국자산관리공사 온비드(공공데이터포털) · 하루 2회 자동
                    갱신
                  </div>
                </div>
              </div>
            )}

            {/* e) 지난 공고 — 접힌 섹션 (최근 마감 상위 일부만) */}
            {pastCards.length > 0 && (
              <details className="rise-in-4 card rounded-2xl px-[18px] py-3">
                <summary className="cursor-pointer text-xs font-extrabold text-text-3">
                  지난 공고 (최근 마감 {pastCards.length}건 보기)
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <div className="min-w-[560px]">
                    <div className="grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] gap-2 border-b border-[#f0f3f8] py-2 text-[10px] text-text-3">
                      <span>물건 · 소재지</span>
                      <span className="text-center">용도</span>
                      <span className="text-center">감정가</span>
                      <span className="text-center">최저가</span>
                      <span className="text-center">입찰마감</span>
                    </div>
                    {pastCards.map((c, i, arr) => (
                      <div
                        key={c.key}
                        className={`grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] items-center gap-2 py-2.5 text-xs opacity-70 ${
                          i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
                        }`}
                      >
                        <span className="truncate-1 font-bold text-ink">
                          {c.name}
                          {c.region ? (
                            <span className="ml-1 text-[10px] font-medium text-text-3">
                              {c.region}
                            </span>
                          ) : null}
                        </span>
                        <span className="truncate-1 text-center font-bold text-text-1">
                          {c.usage ?? "—"}
                        </span>
                        <span className="text-center font-bold text-text-1">{c.appraisalValue}</span>
                        <span className="text-center font-bold text-text-1">{c.minBidValue}</span>
                        <span className="text-center font-bold text-text-1">{c.dateValue}</span>
                      </div>
                    ))}
                    <div className="pb-1 pt-1 text-[10px] text-text-3">
                      입찰이 마감된 공고예요 — 결과·재공고 여부는 온비드에서 확인하세요.
                    </div>
                  </div>
                </div>
              </details>
            )}

            <p className="rise-in-4 mt-1 px-1 text-[11px] leading-[1.6] text-text-3">
              출처: 한국자산관리공사 온비드(공공데이터포털) · 참고용 정보이며 권리분석·명도·정확한
              입찰조건은 온비드 공고 원문과 전문가 확인이 필요합니다.
            </p>
          </div>

          {/* 우측 사이드 (청약 센터와 동일 구성) */}
          <aside className="flex flex-col gap-3.5">
            {/* a) AI 인사이트 — 표시 데이터에서 파생 */}
            <div className="rise-in-2">
              <AIPanel title="공매 인사이트" className="rounded-[18px]">
                <div className="mb-1.5 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                  <span className="text-ai-muted">입찰 중·예정</span>
                  <span className="font-extrabold text-white">
                    {activeTotal.toLocaleString()}건
                  </span>
                </div>
                <div className="mb-2 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                  <span className="text-ai-muted">현재 목록 표시</span>
                  <span className="font-extrabold text-[#a78bfa]">
                    {cards.length.toLocaleString()}건
                  </span>
                </div>
                {dist.length > 0 ? (
                  <>
                    현재 목록에서 <b className="text-[#a78bfa]">{dist[0].label}</b>이(가){" "}
                    {dist[0].count}건으로 가장 많아요. 실입찰 전 공고 원문에서 권리·명도 조건을
                    반드시 확인하세요.
                  </>
                ) : (
                  <>
                    현재 조건에 표시할 물건이 없어요. 데이터가 연동·갱신되면 용도 분포·인사이트가
                    자동으로 채워집니다.
                  </>
                )}
                <Link
                  href="/my/saved-searches"
                  style={{ color: "#fff" }}
                  className="btn-primary mt-2.5 block rounded-[10px] p-[11px] text-center text-xs no-underline"
                >
                  저장 검색으로 알림 받기
                </Link>
              </AIPanel>
            </div>

            {/* b) 지역(자치구)별 요약 — 표시 물건의 소재지 분포. 링크가 gu 필터를 실제로 세팅한다. */}
            <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
              <div className="flex items-center justify-between text-[13px] font-extrabold text-ink">
                지역별 요약
                {gu && (
                  <Link
                    href={usage ? `/auctions?usage=${usage}` : "/auctions"}
                    className="text-[11px] font-bold text-primary no-underline"
                  >
                    {gu} 해제 ×
                  </Link>
                )}
              </div>
              {guDist.length > 0 ? (
                guDist.map((g) => (
                  <Link
                    key={g.name}
                    href={guQuery(g.name)}
                    aria-current={gu === g.name ? "page" : undefined}
                    className={`press flex items-center justify-between rounded-lg px-1.5 py-[6px] text-xs no-underline ${
                      gu === g.name ? "bg-primary-soft" : ""
                    }`}
                  >
                    <span className="font-bold text-ink">{g.name}</span>
                    <span className="text-text-2">{g.count}건</span>
                  </Link>
                ))
              ) : (
                <p className="text-[10px] leading-[1.6] text-text-3">
                  표시할 지역 분포가 아직 없어요. 데이터가 갱신되면 자동으로 채워집니다.
                </p>
              )}
              <p className="text-[10px] leading-[1.6] text-text-3">
                지역을 선택하면 해당 자치구 물건만 볼 수 있어요.
              </p>
            </div>

            {/* c) 용도별 요약 — 용도 필터/카운트 기반 */}
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
                href="https://www.onbid.co.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 text-[11px] font-bold text-primary no-underline"
              >
                온비드 바로가기 ↗
              </a>
            </div>

            {/* d) 광고 자리 */}
            <div className="rise-in-4">
              <AdSlot
                placement="community_feed"
                seed={0}
                adFree={viewer.adFree}
                signedIn={viewer.signedIn}
                plan={viewer.plan}
              />
            </div>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
