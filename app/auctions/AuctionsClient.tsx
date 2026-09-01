"use client";

/* 공매·경매 목록 (2026-08-10 ISR 전환, 사용량 절감 8차)
 *
 * 다른 목록과 다른 제약: 진행 물건 1,130건 > 페치 상한 200 — 전량을 내려보내
 * 클라이언트에서 거르면 필터 결과가 조용히 축소된다(DB 필터는 전체에서 거른다,
 * 실측). 그래서 구조가 셋으로 갈린다:
 *   · 기본 화면(파라미터 없음, 봇이 치는 URL): 서버가 내려준 initialItems —
 *     SSR HTML 에 전부 실린다. 페이지는 ISR(10분).
 *   · 필터(usage·gu): /api/auctions 를 fetch — DB 가 전체에서 거른 결과.
 *     API 는 조합별로 CDN 캐시(s-maxage=600)라 함수 호출이 조합당 10분에 1회.
 *   · (경매 탭은 2026-08-22 폐지 — 개선 #23. ?source=court 구 링크는 온비드로 수렴)
 *
 * 시각 파생값(D-day·진행/마감 분리·캘린더)은 builtAtMs(서버 렌더 시각)로
 * SSR/하이드레이션을 일치시키고, 마운트 후 실제 현재 시각으로 재계산한다 —
 * 예전 force-dynamic 판은 요청 시각, ISR 판은 조회 시각 기준이라 더 신선하다.
 *
 * useSearchParams 금지(프리렌더 HTML 소실 — /town/news 실측). 필터 상태는
 * 마운트 후 location.search + popstate, 칩은 얕은 pushState.
 */

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AIPanel } from "@/app/components/AIPanel";
import type { AuctionApiItem } from "@/app/api/auctions/route";

/* ── lib/onbid/store 는 server-only(supabase) 를 끌고 와 값 import 불가.
      아래 둘은 원본(lib/onbid/store.ts)에서 복제 — 의미 변경 금지. ── */
const AUCTION_USAGE_FILTERS: { key: string; label: string; match: string[] }[] = [
  { key: "apt", label: "아파트", match: ["아파트"] },
  { key: "officetel", label: "오피스텔", match: ["오피스텔"] },
  { key: "villa", label: "빌라·연립", match: ["다세대", "연립", "빌라"] },
  { key: "house", label: "단독·다가구", match: ["단독", "다가구"] },
  { key: "land", label: "토지", match: ["대지", "토지", "전", "답", "임야"] },
  { key: "comm", label: "상가·업무", match: ["상가", "근린", "業務", "업무", "사무"] },
];
function isPastBidEnd(bidEnd: string | null, now: Date): boolean {
  if (!bidEnd) return false;
  const digits = bidEnd.replace(/\D/g, "");
  if (digits.length < 8) return false;
  const y = Number(digits.slice(0, 4));
  const mo = Number(digits.slice(4, 6));
  const da = Number(digits.slice(6, 8));
  if (!y || !mo || !da) return false;
  const end = new Date(y, mo - 1, da);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return end.getTime() < today.getTime();
}

/* ── 포맷·파생 헬퍼 (page.tsx 에서 이동, now 를 인자로 받게만 바꿈) ── */
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
function ddayFrom(v: string | null, now: Date): { label: string; urgent: boolean } | null {
  const target = parseDigitsDate(v);
  if (!target) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return null;
  if (diff === 0) return { label: "D-DAY", urgent: true };
  return { label: `D-${diff}`, urgent: diff <= 3 };
}

function usageDistribution(
  items: { usage: string | null }[],
): { label: string; count: number }[] {
  return AUCTION_USAGE_FILTERS.map((f) => ({
    label: f.label,
    count: items.filter((it) => {
      const u = it.usage;
      if (!u || f.match.length === 0) return false;
      const lower = u.toLowerCase();
      /* 서버(lib/onbid/store.ts)와 동일 규칙: 한 글자("전"·"답")는 정확일치 —
         %전% 부분일치는 "전시장"류를 토지로 세는 과매칭이었다(2026-08-22). */
      return f.match.some((m) =>
        m.length === 1 ? u.trim() === m : lower.includes(m.toLowerCase()),
      );
    }).length,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

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

type CalCell = { day: number; muted: boolean; mark: boolean };
function buildCalendar(
  dates: (string | null)[],
  now: Date,
): { monthLabel: string; cells: CalCell[] } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parsed = dates.map(parseDigitsDate).filter((d): d is Date => d !== null);
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
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
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
  /* 연도 포함(2026-08-22) — 앵커가 내년 첫 마감월일 수 있는데 "3월"만 적으면
     올해 3월로 읽힌다. 올해가 아닐 때만 연도를 붙여 소음을 줄인다. */
  const yearPrefix = year === now.getFullYear() ? "" : `${year}년 `;
  return { monthLabel: `${yearPrefix}${month + 1}월`, cells };
}

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

const ONBID_SEARCH_URL =
  "https://www.onbid.co.kr/op/cltrpbancinf/toppagemng/unfsrch/UnfSrchController/mvmnUnfSrchClg.do";
function onbidSearchHref(a: AuctionApiItem): string {
  const keyword = a.cltrMngNo ?? a.onbidCltrno;
  if (!keyword) return "https://www.onbid.co.kr";
  const params = new URLSearchParams({ swd: keyword, srvcDiv: "search", bfhdDiv: "Y" });
  return `${ONBID_SEARCH_URL}?${params.toString()}`;
}

function onbidToCard(a: AuctionApiItem, now: Date): AuctionCardData {
  return {
    key: a.externalKey,
    href: onbidSearchHref(a),
    name: a.name ?? "물건",
    region: [a.sido, a.sigungu, a.emd].filter(Boolean).join(" "),
    usage: a.usage,
    status: a.status,
    targetDate: a.bidEnd,
    dday: ddayFrom(a.bidEnd, now),
    minBidValue: fmtKrw(a.minBidKrw),
    appraisalValue: fmtKrw(a.appraisalKrw),
    dateValue: fmtDt(a.bidEnd),
  };
}

/* [개선 #23] SourceTabs·CourtAuctionPlaceholder 제거 — 경매 탭 폐지(위 주석). */

/* 필터 상태 — source 필드는 구 딥링크 호환용으로 남긴다(값은 이제 "onbid" 고정) */
type Filter = { usage: string | null; gu: string | null; source: "onbid" | "court" };

function pushFilterUrl(f: Filter) {
  const url = new URL(window.location.href);
  const sp = url.searchParams;
  if (f.usage) sp.set("usage", f.usage);
  else sp.delete("usage");
  if (f.gu) sp.set("gu", f.gu);
  else sp.delete("gu");
  sp.delete("source"); // 경매 탭 폐지(#23) — 구 파라미터는 지운다
  window.history.pushState(null, "", url);
}

type Fetched =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; items: AuctionApiItem[]; activeTotal: number }
  | { state: "error" };

export function AuctionsClient({
  initialItems,
  initialActiveTotal,
  builtAtMs,
  adSlot,
}: {
  initialItems: AuctionApiItem[];
  initialActiveTotal: number;
  /** 서버 렌더 시각 — SSR/하이드레이션의 시간 파생값을 일치시키는 기준 */
  builtAtMs: number;
  /** 서버 조각 — AdSlot 은 server-only 의존이라 여기서 못 그린다 */
  adSlot: ReactNode;
}) {
  const [f, setF] = useState<Filter>({ usage: null, gu: null, source: "onbid" });
  const [fetched, setFetched] = useState<Fetched>({ state: "idle" });
  const [nowMs, setNowMs] = useState(builtAtMs);
  /* 표 표시 상한(2026-08-22) — "실데이터 1,130건" 헤더 아래 24행에서 뚝 끊기고
     끝이었다(페이지네이션 없음). 더보기로 48행씩 연다. 필터를 바꾸면 목록이
     새로 오므로 상한도 처음으로 되돌린다. */
  const [rowCap, setRowCap] = useState(24);

  useEffect(() => {
    setNowMs(Date.now());
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      const u = (p.get("usage") ?? "").trim();
      const g = (p.get("gu") ?? "").trim();
      setF({
        usage: AUCTION_USAGE_FILTERS.some((x) => x.key === u) ? u : null,
        gu: /^[가-힣]{1,10}( [가-힣]{1,10})?$/.test(g) ? g : null, // [941] "성남시 분당구" 공백 1칸 허용
        source: "onbid", // 경매 탭 폐지(#23)
      });
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  /* 필터가 걸리면 DB 필터 결과를 API 로 받아온다(전체 1,130건 대상 — 축소 없음) */
  const filterKey = f.usage || f.gu ? `${f.usage ?? ""}|${f.gu ?? ""}` : null;
  useEffect(() => {
    if (!filterKey) {
      setFetched({ state: "idle" });
      return;
    }
    let alive = true;
    setFetched({ state: "loading" });
    const sp = new URLSearchParams();
    const [u, g] = filterKey.split("|");
    if (u) sp.set("usage", u);
    if (g) sp.set("gu", g);
    fetch(`/api/auctions?${sp.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { ok: boolean; items?: AuctionApiItem[]; activeTotal?: number }) => {
        if (!alive) return;
        if (d.ok && Array.isArray(d.items)) {
          setFetched({ state: "ok", items: d.items, activeTotal: d.activeTotal ?? 0 });
          setNowMs(Date.now());
        } else setFetched({ state: "error" });
      })
      .catch(() => {
        if (alive) setFetched({ state: "error" });
      });
    return () => {
      alive = false;
    };
  }, [filterKey]);

  const set = (patch: Partial<Filter>) => {
    const next = { ...f, ...patch };
    setF(next);
    setRowCap(24); // 새 조건 = 새 목록 — 표 상한도 처음부터
    pushFilterUrl(next);
  };

  const usingFetched = filterKey !== null && fetched.state === "ok";
  const items = usingFetched ? fetched.items : initialItems;
  const activeTotal = usingFetched ? fetched.activeTotal : initialActiveTotal;
  const fetchFailed = filterKey !== null && fetched.state === "error";
  const fetchLoading = filterKey !== null && (fetched.state === "loading" || fetched.state === "idle");

  const derived = useMemo(() => {
    const now = new Date(nowMs);
    const activeItems = items.filter((it) => !isPastBidEnd(it.bidEnd, now));
    const pastItems = items
      .filter((it) => isPastBidEnd(it.bidEnd, now))
      .sort((a, b) => (b.bidEnd ?? "").localeCompare(a.bidEnd ?? ""))
      .slice(0, 8);
    const cards = activeItems.map((a) => onbidToCard(a, now));
    const pastCards = pastItems.map((a) => onbidToCard(a, now));
    const dist = usageDistribution(activeItems);
    const guDist = sigunguDistribution(activeItems);
    const max = Math.max(1, ...dist.map((d) => d.count));
    const withDday = cards.filter((c) => c.dday !== null);
    const imminent = withDday.filter((c) => c.dday?.urgent).slice(0, 4);
    const ongoing = withDday.filter((c) => !c.dday?.urgent).slice(0, 6);
    const { monthLabel, cells } = buildCalendar(cards.map((c) => c.targetDate), now);
    return { cards, pastCards, dist, guDist, max, imminent, ongoing, monthLabel, cells };
  }, [items, nowMs]);

  const { cards, pastCards, dist, guDist, max, imminent, ongoing, monthLabel, cells } = derived;
  const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

  const chip = (on: boolean) =>
    on
      ? "chip-active px-3 py-1.5 text-xs"
      : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2";

  /* [개선 #23, 2026-08-22] 경매(법원) 탭 제거 — 결정 근거:
     대법원 법원경매정보는 공개 API 를 제공하지 않고, 동기화 코드는 소스 키
     미설정 스텁 상태였다(court_auctions 1행 실측). 상시 "준비 중" 탭은
     신뢰만 깎는다 — 탭을 내리고 아래 외부 링크 한 줄로 대체한다. 백엔드
     (store·sync·크론)는 소스가 생기는 날을 위해 남겨 둔다.
     구 딥링크(?source=court)는 온비드 화면으로 자연 수렴한다. */
  return (
    <>
      {/* 상단 필 행: 용도 필터 + CTA */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => set({ usage: null })}
            style={!f.usage ? { color: "#fff" } : undefined}
            className={
              !f.usage
                ? "chip-active px-3 py-1.5 text-xs"
                : "press chip border border-line bg-surface px-3 py-1.5 text-xs text-text-2"
            }
          >
            전체
          </button>
          {AUCTION_USAGE_FILTERS.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => set({ usage: f.usage === x.key ? null : x.key })}
              style={f.usage === x.key ? { color: "#fff" } : undefined}
              className={chip(f.usage === x.key)}
            >
              {x.label}
            </button>
          ))}
        </div>
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
          <Link
            href="/my/saved-searches"
            className="press rounded-full bg-primary-soft px-3.5 py-2 font-bold text-primary no-underline"
          >
            저장 검색으로 알림 받기
          </Link>
        </div>
      </div>

      {/* 요약 라인 */}
      <p className="rise-in mb-3 t-body text-text-2">
        한국자산관리공사 <strong className="text-ink">온비드</strong> 공매 부동산 — 입찰
        중·예정 물건 <strong className="text-ink">{activeTotal.toLocaleString()}건</strong>.
        감정가·최저입찰가·입찰일정은 공공 데이터 기준입니다.
      </p>

      {/* 정직 안내 · 면책 */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 t-sub text-primary">
        <span>
          감정가·최저입찰가·입찰일정은 <b className="font-bold">공공 데이터</b> 기준이며 매일
          자동 갱신됩니다. 갱신 사이에 변경·취소될 수 있으니 실제 입찰·명도 조건은{" "}
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

      {fetchFailed ? (
        /* 필터 조회 실패 — "0건"이 아니라 실패라고 말한다 */
        <div className="rise-in-1 card p-[var(--pad-card)]">
          <div className="rounded-[12px] border border-line bg-surface px-4 py-12 text-center t-body text-text-3">
            이 조건의 목록을 지금 불러오지 못했어요 — 물건이 0건인 게 아니라 조회가
            실패했습니다. 잠시 후 다시 시도하거나{" "}
            <button
              type="button"
              onClick={() => set({ usage: null, gu: null })}
              className="font-bold text-primary underline"
            >
              전체 목록으로 돌아가세요
            </button>
            .
          </div>
        </div>
      ) : fetchLoading ? (
        <div className="rise-in-1 card p-[var(--pad-card)]">
          <div className="rounded-[12px] border border-line bg-surface px-4 py-12 text-center t-body text-text-3">
            조건에 맞는 물건을 불러오는 중…
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-3">
            {/* a) 입찰 캘린더 */}
            <div className="rise-in-1 card flex flex-col gap-2.5 rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                  {monthLabel} 입찰 캘린더
                </span>
                <div className="flex gap-2.5 t-sub">
                  <span className="flex items-center gap-1 text-text-2">
                    <span className="h-2 w-2 rounded-[2px] bg-primary" />
                    입찰마감일
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center t-caption text-text-3">
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
                          className={`rounded-md chip-pad text-[11px] font-extrabold text-white ${
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
                            <span className="rounded bg-primary-soft px-[7px] py-0.5 t-caption font-extrabold text-primary">
                              {c.usage}
                            </span>
                          )}
                        </div>
                        <div className="t-sub text-text-3">{c.region || "—"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3.5">
                      <div className="text-right">
                        <div className="t-sub text-text-3">감정가</div>
                        <div className="t-body font-extrabold text-ink">{c.appraisalValue}</div>
                      </div>
                      <div className="text-right">
                        <div className="t-sub text-text-3">최저입찰가</div>
                        <div className="t-body font-extrabold text-primary">{c.minBidValue}</div>
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

            {/* c) 마감 임박 / 예정 */}
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
                      <span className="rounded-md bg-danger-fill chip-pad t-sub font-extrabold text-white">
                        {c.dday?.label}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold text-ink">
                          {c.name}
                          {c.usage && (
                            <span className="rounded bg-primary-soft px-[7px] py-0.5 t-caption font-extrabold text-primary">
                              {c.usage}
                            </span>
                          )}
                        </div>
                        <div className="t-sub text-text-3">
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

            {/* d) 진행·예정 물건 표 */}
            <div className="rise-in-4 px-1 pt-1.5 text-xs font-extrabold text-text-3">
              진행·예정 물건 · 온비드 실데이터 {activeTotal.toLocaleString()}건
              {(f.usage || f.gu) && <> · 현재 조건 {cards.length.toLocaleString()}건</>}
            </div>
            {cards.length === 0 ? (
              <div className="rise-in-4 card p-[var(--pad-card)]">
                <div className="rounded-[12px] border border-line bg-surface px-4 py-12 text-center t-body text-text-3">
                  현재 조건의 진행·예정 공매 물건이 없어요. 데이터는 매일 자동
                  갱신됩니다.
                </div>
              </div>
            ) : (
              <div className="rise-in-4 card overflow-x-auto rounded-2xl px-[18px] py-1">
                <div className="min-w-[560px]">
                  <div className="grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] gap-2 border-b border-divider py-2 t-caption text-text-3">
                    <span>물건 · 소재지</span>
                    <span className="text-center">용도</span>
                    <span className="text-center">감정가</span>
                    <span className="text-center">최저가</span>
                    <span className="text-center">입찰마감</span>
                  </div>
                  {cards.slice(0, rowCap).map((c, i, arr) => (
                    <div
                      key={c.key}
                      className={`grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] items-center gap-2 py-2.5 text-xs ${
                        i < arr.length - 1 ? "border-b border-divider" : ""
                      }`}
                    >
                      <span className="truncate-1 font-bold text-ink">
                        {c.name}
                        {c.region ? (
                          <span className="ml-1 t-caption font-medium text-text-3">{c.region}</span>
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
                  {cards.length > rowCap && (
                    <button
                      type="button"
                      onClick={() => setRowCap((n) => n + 48)}
                      className="press my-2 w-full rounded-xl bg-bg py-2.5 text-center t-sub font-bold text-primary"
                    >
                      더보기 ({Math.min(rowCap, cards.length).toLocaleString()} /{" "}
                      {cards.length.toLocaleString()}건)
                    </button>
                  )}
                  <div className="pb-2 pt-1 t-caption text-text-3">
                    마감 임박순 · 출처: 한국자산관리공사 온비드(공공데이터포털) · 매일 자동
                    갱신
                  </div>
                </div>
              </div>
            )}

            {/* e) 지난 공고 */}
            {pastCards.length > 0 && (
              <details className="rise-in-4 card rounded-2xl px-[18px] py-3">
                <summary className="cursor-pointer text-xs font-extrabold text-text-3">
                  지난 공고 (최근 마감 {pastCards.length}건 보기)
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <div className="min-w-[560px]">
                    <div className="grid grid-cols-[1.9fr_.8fr_.8fr_.8fr_1fr] gap-2 border-b border-divider py-2 t-caption text-text-3">
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
                          i < arr.length - 1 ? "border-b border-divider" : ""
                        }`}
                      >
                        <span className="truncate-1 font-bold text-ink">
                          {c.name}
                          {c.region ? (
                            <span className="ml-1 t-caption font-medium text-text-3">
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
                    <div className="pb-1 pt-1 t-caption text-text-3">
                      입찰이 마감된 공고예요 — 결과·재공고 여부는 온비드에서 확인하세요.
                    </div>
                  </div>
                </div>
              </details>
            )}

            <p className="rise-in-4 mt-1 px-1 t-sub text-text-3">
              출처: 한국자산관리공사 온비드(공공데이터포털) · 참고용 정보이며 권리분석·명도·정확한
              입찰조건은 온비드 공고 원문과 전문가 확인이 필요합니다.
            </p>
          </div>

          {/* 우측 사이드 */}
          <aside className="flex flex-col gap-3.5">
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

            {/* 지역(자치구)별 요약 — 버튼이 gu 필터를 세팅한다 */}
            <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
              <div className="flex items-center justify-between t-body font-extrabold text-ink">
                지역별 요약
                {f.gu && (
                  <button
                    type="button"
                    onClick={() => set({ gu: null })}
                    className="t-sub font-bold text-primary"
                  >
                    {f.gu} 해제 ×
                  </button>
                )}
              </div>
              {guDist.length > 0 ? (
                guDist.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => set({ gu: f.gu === g.name ? null : g.name })}
                    aria-current={f.gu === g.name ? "page" : undefined}
                    className={`press flex items-center justify-between rounded-lg px-1.5 py-[6px] text-xs ${
                      f.gu === g.name ? "bg-primary-soft" : ""
                    }`}
                  >
                    <span className="font-bold text-ink">{g.name}</span>
                    <span className="text-text-2">{g.count}건</span>
                  </button>
                ))
              ) : (
                <p className="t-caption text-text-3">
                  표시할 지역 분포가 아직 없어요. 데이터가 갱신되면 자동으로 채워집니다.
                </p>
              )}
              <p className="t-caption text-text-3">
                지역을 선택하면 해당 자치구 물건만 볼 수 있어요.
              </p>
            </div>

            {/* 용도별 요약 */}
            <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
              <div className="flex items-center gap-1.5 t-body font-extrabold text-ink">
                용도별 요약
              </div>
              {dist.length > 0 ? (
                dist.map((d) => (
                  <div key={d.label} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 t-sub text-text-1">{d.label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-soft">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.round((d.count / max) * 100)}%` }}
                      />
                    </span>
                    <span className="w-7 shrink-0 text-right t-sub font-bold text-ink">
                      {d.count}
                    </span>
                  </div>
                ))
              ) : (
                <p className="t-caption text-text-3">
                  표시할 용도 분포가 아직 없어요. 데이터가 연동되면 자동으로 채워집니다.
                </p>
              )}
              <a
                href="https://www.onbid.co.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 t-sub font-bold text-primary no-underline"
              >
                온비드 바로가기 ↗
              </a>
            </div>

            {/* 광고 — 서버 조각 */}
            <div className="rise-in-4">{adSlot}</div>
          </aside>
        </div>
      )}
    </>
  );
}

export default AuctionsClient;
