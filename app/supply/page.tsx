import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";
import { ExampleBadge } from "@/app/components/ExampleBadge";
import {
  getSupplyRegions,
  getSupplyMonthly,
  getSupplyList,
} from "@/lib/market/supply";
import type { SupplyItem } from "@/lib/market/supply";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "아파트 입주 예정 물량 | 누구집",
  description:
    "전국·지역별 아파트 입주 예정 물량(공급) 캘린더 — 입주월·단지·세대수. 공급이 많은 시기와 지역을 한눈에.",
  robots: { index: true, follow: true },
};

/** 테마 구분: 입주 물량 = 초록 (공급·신축). 하위 클래스(text-primary·bg-primary-soft·
 *  chip-active·btn-primary)가 이 subtree 안에서 초록으로 재테마됨. */
const SUPPLY_THEME = {
  "--primary": "#0e9f6e",
  "--primary-soft": "#e7f6ef",
  "--primary-strong": "#0b8058",
} as CSSProperties;

const SOURCE_URL = "https://www.data.go.kr";

function fmtYm(ym: string): string {
  if (!/^\d{6}$/.test(ym)) return ym;
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

function monthLabel(ym: string): string {
  if (!/^\d{6}$/.test(ym)) return "미정";
  return `${Number(ym.slice(4, 6))}월`;
}

type SupplyGroup = {
  key: string;
  label: string;
  items: SupplyItem[];
  households: number;
};

/** 입주월 기준 분기 그룹화 — 청약 센터의 섹션형 카드 패턴을 위해 목록을 분기 섹션으로 나눔.
 *  (list는 이미 입주월 오름차순 정렬 → groups도 자연스럽게 시간순) */
function groupByQuarter(list: SupplyItem[]): SupplyGroup[] {
  const groups: SupplyGroup[] = [];
  const map = new Map<string, SupplyGroup>();
  for (const s of list) {
    const ym = s.moveInYm;
    const valid = /^\d{6}$/.test(ym);
    const year = valid ? ym.slice(0, 4) : "";
    const mo = valid ? Number(ym.slice(4, 6)) : 0;
    const q = mo >= 1 && mo <= 12 ? Math.ceil(mo / 3) : 0;
    const key = valid ? `${year}-${q}` : "unknown";
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        label: valid ? `${year}년 ${q}분기 입주 예정` : "입주 시기 미정",
        items: [],
        households: 0,
      };
      map.set(key, g);
      groups.push(g);
    }
    g.items.push(s);
    g.households += s.households ?? 0;
  }
  return groups;
}

/** 현재(또는 임의) 날짜 → groupByQuarter 키 포맷과 동일한 `${year}-${q}` */
function quarterKey(d: Date): string {
  return `${d.getFullYear()}-${Math.ceil((d.getMonth() + 1) / 3)}`;
}

type CalCell = { day: number; muted: boolean; mark: boolean };

/** 월 캘린더 그리드 생성 — 청약 센터의 월별 캘린더와 동일한 셀 구조(월요일 시작).
 *  입주는 월 단위 데이터라 특정 일자 매핑이 불가 → 대표 셀(markDays)에 예시 표시. */
function buildMonthCalendar(ym: string | null, markDays: number[]): CalCell[] {
  let year = 2026;
  let month0 = 0;
  if (ym && /^\d{6}$/.test(ym)) {
    year = Number(ym.slice(0, 4));
    month0 = Number(ym.slice(4, 6)) - 1;
  }
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const prevDays = new Date(year, month0, 0).getDate();
  const lead = (new Date(year, month0, 1).getDay() + 6) % 7; // 월요일 시작 오프셋
  const marks = new Set(markDays);
  const cells: CalCell[] = [];
  for (let i = lead - 1; i >= 0; i--) {
    cells.push({ day: prevDays - i, muted: true, mark: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, muted: false, mark: marks.has(d) });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: next++, muted: true, mark: false });
  }
  return cells;
}

/** 청약 센터와 동일한 AD 슬롯 자리표시자 (AdSense 320×64) */
function AdSlot() {
  return (
    <div className="flex h-16 flex-col items-center justify-center gap-[3px] rounded-[14px] border border-dashed border-[#d8dfea] bg-surface">
      <span className="rounded border border-[#e2e7ee] px-1.5 text-[9px] font-bold tracking-widest text-[#adb5bd]">
        AD
      </span>
      <span className="font-mono text-[11px] text-[#adb5bd]">AdSense 320×64</span>
    </div>
  );
}

export default async function SupplyPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;
  const active = (region ?? "").trim() || undefined;

  const [regions, monthly, list] = await Promise.all([
    getSupplyRegions(),
    getSupplyMonthly(active),
    getSupplyList(active, 200),
  ]);

  const totalHouseholds = monthly.reduce((s, m) => s + m.households, 0);
  const totalCount = monthly.reduce((s, m) => s + m.count, 0);
  const peak =
    monthly.length > 0
      ? monthly.reduce((a, b) => (b.households > a.households ? b : a))
      : null;
  const groups = groupByQuarter(list);
  const scope = active ? `${active} ` : "전국 ";

  // 이번 분기(가장 가까운 분기) / 다가오는(예정) 분기 나누기 — 청약 센터의 접수중/예정 구성 대응
  const nowKey = quarterKey(new Date());
  let currentIdx = groups.findIndex((g) => g.key === nowKey);
  if (currentIdx < 0) currentIdx = groups.findIndex((g) => g.key !== "unknown");
  const thisQuarter = currentIdx >= 0 ? groups[currentIdx] : null;
  const upcomingItems =
    currentIdx >= 0
      ? groups
          .slice(currentIdx + 1)
          .filter((g) => g.key !== "unknown")
          .flatMap((g) => g.items)
      : [];

  const featured = thisQuarter ? thisQuarter.items.slice(0, 6) : [];
  const featuredMore = thisQuarter
    ? Math.max(0, thisQuarter.items.length - featured.length)
    : 0;
  const upcomingShown = upcomingItems.slice(0, 6);
  const upcomingMore = Math.max(0, upcomingItems.length - upcomingShown.length);

  // 캘린더: 최다 입주 월(피크)을 대표 월로, 입주 표시일은 예시(주 1회 대표 셀)
  const calTitle = peak ? monthLabel(peak.ym) : "이번 분기";
  const calCells =
    monthly.length > 0
      ? buildMonthCalendar(peak ? peak.ym : null, [8, 15, 22, 29])
      : [];

  return (
    <PageShell breadcrumb="동네이야기 › 입주 물량" wide>
      <div style={SUPPLY_THEME}>
        {/* 상단 탭 + CTA (청약 센터 상단 row 패턴) */}
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5 text-[13px]">
            <span className="rounded-full bg-ink px-3.5 py-2 font-bold text-white">
              전체
            </span>
            <span className="glass rounded-full px-3.5 py-2 font-bold text-primary">
              이번 분기
            </span>
            <span className="glass rounded-full px-3.5 py-2 font-semibold text-text-2">
              예정
            </span>
            <span className="glass rounded-full px-3.5 py-2 font-semibold text-text-2">
              지난 입주
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex flex-wrap gap-1.5 text-xs">
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="glass press rounded-full px-3.5 py-2 font-bold text-primary no-underline"
            >
              공공데이터 출처 ↗
            </a>
            <Link
              href="/notifications"
              className="press rounded-full bg-primary-soft px-3.5 py-2 font-bold text-primary no-underline"
            >
              입주 물량 알림
            </Link>
            <Link
              href="/map"
              className="glass press rounded-full px-3.5 py-2 font-bold text-text-1 no-underline"
            >
              지도에서 보기
            </Link>
          </div>
        </div>

        {/* 정직 안내 배너 (초록 틴트) — 캘린더·카드는 예시 구성, 표는 실데이터 */}
        <div
          className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6]"
          style={{ color: "var(--primary-strong)" }}
        >
          <ExampleBadge />
          <span>
            입주 캘린더는 서비스 <b>예시 구성</b>이에요 (입주는 월 단위
            자료라 대표 일자로 표시). 공개 입주예정물량 자료(2026.02 기준)를
            취합한 참고 정보이며, 사업 진행·일정 변경에 따라 실제와 다를 수
            있어요. 아래 “지난·전체 입주 예정 단지” 표는{" "}
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-primary underline"
            >
              공공데이터(data.go.kr)
            </a>{" "}
            기반입니다.
          </span>
        </div>

        {/* 2단 레이아웃 (청약 센터: 본문 + 우측 사이드) */}
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          {/* ── 본문 ── */}
          <div className="flex flex-col gap-3">
            {/* 입주 캘린더 (청약 센터 월별 캘린더와 동일 스타일) */}
            <div className="rise-in-1 card flex flex-col gap-2.5 rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                  {calTitle} 입주 캘린더 <ExampleBadge />
                </span>
                <div className="flex gap-2.5 text-[11px]">
                  <span className="flex items-center gap-1 text-text-2">
                    <span className="h-2 w-2 rounded-[2px] bg-primary" />
                    입주 (예시)
                  </span>
                </div>
              </div>
              {calCells.length > 0 ? (
                <>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[#adb5bd]">
                    {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calCells.map((c, i) => (
                      <div
                        key={i}
                        className={`h-11 rounded-lg px-1.5 py-1 text-[10px] ${
                          c.mark
                            ? "border border-line bg-primary-soft text-text-1"
                            : "bg-bg text-text-3"
                        } ${c.muted ? "opacity-40" : ""}`}
                      >
                        {c.day}
                        {c.mark && (
                          <div className="mt-0.5 h-1.5 rounded-[2px] bg-primary" />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-[12px] border border-line bg-surface px-4 py-8 text-center text-[13px] text-text-3">
                  입주 캘린더에 표시할 데이터가 없어요.
                </div>
              )}
            </div>

            {/* 이번 분기 입주 (청약 센터 접수중 카드 — 초록 강조) */}
            {featured.length > 0 && (
              <>
                <div className="rise-in-2 flex items-baseline justify-between px-1">
                  <span className="text-xs font-extrabold text-primary">
                    이번 분기 입주 · {thisQuarter?.items.length ?? 0}곳
                  </span>
                  {thisQuarter && (
                    <span className="text-[11px] text-text-3">
                      {thisQuarter.label} · {thisQuarter.households.toLocaleString()}세대
                    </span>
                  )}
                </div>
                {featured.map((s, i) => (
                  <div
                    key={`now-${s.aptName ?? "미정"}-${i}`}
                    className="rise-in-2 flex flex-col gap-3 rounded-2xl border-[1.5px] border-primary bg-surface px-[18px] py-3.5 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-extrabold text-white">
                        {monthLabel(s.moveInYm)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                          <span className="truncate">{s.aptName ?? "미정"}</span>
                          {s.bizType && (
                            <span className="shrink-0 rounded bg-primary-soft px-[7px] py-0.5 text-[10px] font-extrabold text-primary">
                              {s.bizType}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-text-3">
                          {s.households
                            ? `${s.households.toLocaleString()}세대 · `
                            : ""}
                          {s.address ?? s.region}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3.5">
                      <div className="text-right">
                        <div className="text-[11px] text-text-3">입주 예정</div>
                        <div className="text-[13px] font-extrabold text-primary">
                          {fmtYm(s.moveInYm)}
                        </div>
                      </div>
                      <Link
                        href="/notifications"
                        className="btn-primary press rounded-[10px] px-4 py-[9px] text-xs no-underline"
                        style={{ color: "#fff" }}
                      >
                        입주 알림 ›
                      </Link>
                    </div>
                  </div>
                ))}
                {featuredMore > 0 && (
                  <p className="rise-in-2 px-1 text-[11px] leading-[1.6] text-text-3">
                    외 {featuredMore.toLocaleString()}곳 — 전체 목록은 아래 표에서
                    확인하세요.
                  </p>
                )}
              </>
            )}

            {/* 다가오는 입주 (예정) — 청약 센터 예정 카드 */}
            {upcomingShown.length > 0 && (
              <>
                <div className="rise-in-3 px-1 pt-1.5 text-xs font-extrabold text-text-3">
                  다가오는 입주 (예정) · {upcomingItems.length.toLocaleString()}곳
                </div>
                {upcomingShown.map((s, i) => (
                  <div
                    key={`next-${s.aptName ?? "미정"}-${i}`}
                    className="rise-in-3 card flex items-center justify-between gap-3 rounded-2xl px-[18px] py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 rounded-md bg-[#f2f4f8] px-2 py-1 text-[11px] font-extrabold text-text-2">
                        {monthLabel(s.moveInYm)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                          <span className="truncate">{s.aptName ?? "미정"}</span>
                          {s.bizType && (
                            <span className="shrink-0 rounded bg-primary-soft px-[7px] py-0.5 text-[10px] font-extrabold text-primary">
                              {s.bizType}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-text-3">
                          {s.households
                            ? `${s.households.toLocaleString()}세대 · `
                            : ""}
                          {s.address ?? s.region} · 입주 {fmtYm(s.moveInYm)}
                        </div>
                      </div>
                    </div>
                    <Link
                      href="/notifications"
                      className="shrink-0 rounded-[10px] bg-primary-soft px-4 py-[9px] text-xs font-bold text-primary no-underline"
                    >
                      입주 알림 받기 ›
                    </Link>
                  </div>
                ))}
                <p className="rise-in-3 px-1 text-[11px] leading-[1.6] text-text-3">
                  {upcomingMore > 0
                    ? `이번 분기·예정 카드는 대표 단지를 추려 보여드려요 (예정 외 ${upcomingMore.toLocaleString()}곳). 전체 목록은 아래 표에서 확인하세요.`
                    : "이번 분기·예정 카드는 대표 단지를 추려 보여드려요 — 전체 목록은 아래 표에서 확인하세요."}
                </p>
              </>
            )}

            {/* 지난·전체 입주 예정 단지 (청약 센터 실데이터 표) */}
            <div className="rise-in-4 px-1 pt-1.5 text-xs font-extrabold text-text-3">
              {list.length > 0
                ? `지난·전체 입주 예정 단지 · ${list.length.toLocaleString()}곳`
                : "지난·전체 입주 예정 단지"}
            </div>
            {list.length === 0 ? (
              <div className="rise-in-4 card rounded-2xl px-4 py-8 text-center text-[13px] text-text-3">
                해당 지역 입주 예정 물량 데이터가 없어요.
              </div>
            ) : (
              <div className="rise-in-4 card overflow-x-auto rounded-2xl px-[18px] py-1">
                <div className="min-w-[520px]">
                  <div className="grid grid-cols-[1.8fr_.8fr_.8fr_.9fr] gap-2 border-b border-divider py-2 text-[10px] text-text-3">
                    <span>단지 · 지역</span>
                    <span className="text-center">입주월</span>
                    <span className="text-center">세대수</span>
                    <span className="text-center">사업유형</span>
                  </div>
                  {list.map((item, i, arr) => (
                    <div
                      key={`row-${item.aptName ?? "미정"}-${i}`}
                      className={`grid grid-cols-[1.8fr_.8fr_.8fr_.9fr] items-center gap-2 py-2.5 text-xs ${
                        i < arr.length - 1 ? "border-b border-divider" : ""
                      }`}
                    >
                      <span className="truncate font-bold text-ink">
                        {item.aptName ?? "미정"}
                        <span className="ml-1 text-[10px] font-medium text-text-3">
                          {item.region}
                        </span>
                      </span>
                      <span className="text-center font-bold text-text-1">
                        {fmtYm(item.moveInYm)}
                      </span>
                      <span className="text-center font-bold text-text-1">
                        {item.households
                          ? item.households.toLocaleString()
                          : "—"}
                      </span>
                      <span className="text-center font-extrabold text-primary">
                        {item.bizType ?? "—"}
                      </span>
                    </div>
                  ))}
                  <div className="pb-2 pt-1 text-[10px] text-[#adb5bd]">
                    출처 공공데이터(data.go.kr) 입주예정물량 · 2026.02 기준
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── 우측 사이드 (청약 센터 aside 구성) ── */}
          <aside className="flex flex-col gap-3.5">
            {/* AI 인사이트 패널 (실 수치 — 최다 입주 시기·총 세대수) */}
            <div className="rise-in-2">
              <AIPanel title="입주 물량 인사이트 (예시)" className="rounded-[18px]">
                {monthly.length === 0 ? (
                  <>
                    표시할 입주 물량 데이터가 없어요. 지역을 바꾸거나 전국을
                    선택해 보세요.
                  </>
                ) : (
                  <>
                    <div className="mb-1.5 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                      <span className="text-ai-muted">최다 입주 시기</span>
                      <span className="font-extrabold text-white">
                        {peak ? fmtYm(peak.ym) : "—"}
                      </span>
                    </div>
                    <div className="mb-2 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                      <span className="text-ai-muted">총 예정 세대</span>
                      <span className="font-extrabold text-[#7ea2ff]">
                        {totalHouseholds.toLocaleString()}세대
                      </span>
                    </div>
                    {scope}기준{" "}
                    <b className="text-[#7ea2ff]">
                      {peak ? fmtYm(peak.ym) : "—"}
                    </b>
                    에 입주가 가장 몰려 있어요
                    {peak ? ` (약 ${peak.households.toLocaleString()}세대)` : ""}.
                    입주장에는 인근 전·월세 매물이 늘어 임차 협상에 유리할 수
                    있어요.
                  </>
                )}
              </AIPanel>
            </div>

            {/* 지역별 입주 요약 (getSupplyRegions → 지역 필터 링크) */}
            <div className="rise-in-3 card flex flex-col gap-1 rounded-[18px] p-[18px]">
              <div className="mb-1 text-[13px] font-extrabold text-ink">
                지역별 입주 요약
              </div>
              {regions.length === 0 ? (
                <p className="text-[10px] leading-[1.6] text-text-3">
                  표시할 지역 데이터가 없어요.
                </p>
              ) : (
                <>
                  {regions.slice(0, 5).map((r, i) => {
                    const on = active === r.region;
                    return (
                      <Link
                        key={r.region}
                        href={`/supply?region=${encodeURIComponent(r.region)}`}
                        aria-current={on ? "page" : undefined}
                        className={`press flex items-center justify-between rounded-lg px-1.5 py-[7px] text-xs no-underline ${
                          on ? "bg-primary-soft" : ""
                        }`}
                      >
                        <span className="flex items-center gap-2 font-bold text-ink">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[10px] font-extrabold text-primary">
                            {i + 1}
                          </span>
                          {r.region}
                        </span>
                        <span className="text-text-2">
                          {r.households.toLocaleString()}세대 · {r.count}곳
                        </span>
                      </Link>
                    );
                  })}
                  <p className="mt-1 text-[10px] leading-[1.6] text-text-3">
                    지역을 선택하면 해당 지역 입주 물량만 볼 수 있어요.
                  </p>
                </>
              )}
            </div>

            {/* AD 슬롯 (청약 센터와 동일) */}
            <div className="rise-in-4">
              <AdSlot />
            </div>
          </aside>
        </div>

        {/* 면책 (초록 톤 유지) */}
        <p className="mt-6 text-[11px] leading-[1.6] text-text-3">
          입주 예정 물량은 공개 자료를 취합한 참고용 정보이며, 사업 진행·일정
          변경에 따라 실제와 다를 수 있습니다.
        </p>
      </div>
    </PageShell>
  );
}
