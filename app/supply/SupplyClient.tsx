"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bars } from "@/app/components/viz/Bars";
// server-only 체인이 있는 모듈이라 값 import 는 불가 — 타입은 컴파일에서 소거되므로 안전.
import type { SupplyItem } from "@/lib/market/supply";
import { AIPanel } from "@/app/components/AIPanel";

/**
 * /supply 클라이언트 셸 (사용량 절감 9차 — ISR 전환의 클라이언트 절반).
 *
 * 서버(ISR)는 전국 전량(실측 675행)을 그대로 SSR 로 그린다 — 크롤러 HTML 이
 * 온전히 남는다. 지역 필터는 마운트 후 location.search 에서 읽고, 칩은
 * history.pushState 를 하는 버튼이다 (useSearchParams 는 프리렌더 HTML 에서
 * 그 서브트리를 지운다 — /town/news 에서 실측으로 배운 것).
 *
 * 필터 동치성: 예전 서버는 지역을 DB .eq 로 걸었다. 전량(675행)이 페치 상한
 * (SUPPLY_FETCH_CAP=2000) 안에 들어오므로 메모리 필터가 서버 필터와 동치다.
 * 상한에 도달한 적재가 생기면 truncated 로 내려와 화면에 그대로 알린다.
 *
 * 조용한 상한 정정: 예전 페이지는 getSupplyList(region, 200) 이라 전국 보기가
 * 675곳 중 200곳만 그리면서 "· 200곳" 이라고 적었다 (경기 209곳도 잘렸다).
 * 이제 곳수는 전량 기준으로 적고, 표는 200행에서 시작하되 "더 보기"로 나머지를
 * 펼친다 — 상한을 가리지 않는다.
 */

const TABLE_INITIAL_ROWS = 200;

type MonthBucket = { ym: string; count: number; households: number };

type Group = {
  key: string;
  label: string;
  items: SupplyItem[];
  households: number;
};

function fmtYm(ym: string): string {
  if (!/^\d{6}$/.test(ym)) return ym;
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

function monthLabel(ym: string): string {
  if (!/^\d{6}$/.test(ym)) return "미정";
  return `${Number(ym.slice(4, 6))}월`;
}

/** 지역 묶음 키 — 예전 getSupplyRegions 의 String(row.region ?? "기타") 와 동일 규칙 */
function regionKey(s: SupplyItem): string {
  return s.region || "기타";
}

/** 예전 lib getSupplyRegions 와 동일: 지역별 집계, 세대수 내림차순 */
function deriveRegions(
  items: SupplyItem[],
): { region: string; count: number; households: number }[] {
  const map = new Map<string, { count: number; households: number }>();
  for (const s of items) {
    const key = regionKey(s);
    const e = map.get(key) ?? { count: 0, households: 0 };
    e.count += 1;
    e.households += Number(s.households ?? 0) || 0;
    map.set(key, e);
  }
  return [...map.entries()]
    .map(([region, v]) => ({ region, ...v }))
    .sort((a, b) => b.households - a.households);
}

/** 예전 lib getSupplyMonthly 와 동일: 월별 집계 (유효 YYYYMM 만), ym 오름차순 */
function deriveMonthly(items: SupplyItem[]): MonthBucket[] {
  const map = new Map<string, { count: number; households: number }>();
  for (const s of items) {
    if (!/^\d{6}$/.test(s.moveInYm)) continue;
    const e = map.get(s.moveInYm) ?? { count: 0, households: 0 };
    e.count += 1;
    e.households += Number(s.households ?? 0) || 0;
    map.set(s.moveInYm, e);
  }
  return [...map.entries()]
    .map(([ym, v]) => ({ ym, ...v }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

/** 입주월 기준 분기 그룹화 — 예전 서버 페이지의 groupByQuarter 그대로 */
function groupByQuarter(list: SupplyItem[]): Group[] {
  const groups: Group[] = [];
  const map = new Map<string, Group>();
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

function quarterKey(d: Date): string {
  return `${d.getFullYear()}-${Math.ceil((d.getMonth() + 1) / 3)}`;
}

function readRegionFromLocation(): string | null {
  const raw = new URLSearchParams(window.location.search).get("region");
  const v = (raw ?? "").trim();
  return v || null;
}

export function SupplyClient({
  items,
  truncated,
  asOfLabel,
  builtAtMs,
  adSlot,
}: {
  items: SupplyItem[];
  truncated: boolean;
  asOfLabel: string | null;
  builtAtMs: number;
  adSlot: ReactNode;
}) {
  // SSR/첫 하이드레이션은 전국(null) — 프리렌더 HTML 과 정확히 일치.
  const [region, setRegion] = useState<string | null>(null);
  const [tableExpanded, setTableExpanded] = useState(false);
  /* [2026-08-22] 지역 목록이 상위 5개에서 잘려 6위 이하 시도는 URL 을 손으로
     고치지 않으면 선택 자체가 불가능했다 — 전체 보기 토글로 연다. */
  const [regionsOpen, setRegionsOpen] = useState(false);
  // ISR 페이지의 시각 파생값(이번 분기 판정)은 서버 시각으로 하이드레이션을
  // 일치시킨 뒤 마운트에서 실제 시각으로 재계산한다 (auctions 선례).
  const [nowMs, setNowMs] = useState(builtAtMs);

  useEffect(() => {
    setNowMs(Date.now());
    setRegion(readRegionFromLocation());
    const onPop = () => {
      setRegion(readRegionFromLocation());
      setTableExpanded(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const selectRegion = (next: string | null) => {
    setRegion(next);
    setTableExpanded(false);
    const url = next ? `/supply?region=${encodeURIComponent(next)}` : "/supply";
    window.history.pushState(null, "", url);
  };

  // ── 파생 (675행 규모라 렌더마다 계산해도 무시할 수준) ──────────────────────
  const regions = deriveRegions(items); // 항상 전량 기준 (예전 getSupplyRegions() 와 동일)
  const filtered = region ? items.filter((s) => regionKey(s) === region) : items;
  const monthly = deriveMonthly(filtered);
  const list = filtered; // 서버 정렬(move_in_ym asc)이 필터로 보존됨

  const totalHouseholds = monthly.reduce((s, m) => s + m.households, 0);
  const peak =
    monthly.length > 0
      ? monthly.reduce((a, b) => (b.households > a.households ? b : a))
      : null;
  const groups = groupByQuarter(list);
  const scope = region ? `${region} ` : "전국 ";

  const nowKey = quarterKey(new Date(nowMs));
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

  const monthlyShown = monthly.slice(-24);
  const monthlyMax = monthlyShown.reduce((m, b) => Math.max(m, b.households), 0);

  const tableRows = tableExpanded ? list : list.slice(0, TABLE_INITIAL_ROWS);
  const tableHiddenCount = list.length - tableRows.length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ── 본문 ── */}
      <div className="flex flex-col gap-3">
        {truncated && (
          <div className="rounded-[10px] border border-line bg-surface px-4 py-3 t-sub text-text-3">
            데이터가 조회 상한에 도달해 일부가 잘렸을 수 있어요 — 지역별 곳수·
            세대수 합계가 실제보다 적게 보일 수 있습니다.
          </div>
        )}

        {/* ── 입주 캘린더(월 그리드)가 아니라 월별 막대인 이유 ──────────────────
            예전에 이 자리에는 날짜 셀 42칸짜리 월 캘린더가 있었고, 매달
            8·15·22·29일에 막대가 찍혀 있었다. 그 네 날짜는 데이터가 아니라 코드에
            박아 둔 상수였다 — apartment_supply 는 move_in_ym(입주 **월**)까지만
            가진 자료라 특정 일자를 알 방법이 아예 없다. "예시" 배지로는 없는
            일정이 있는 것처럼 보이는 걸 막을 수 없어 지웠다. 실제로 가진 축
            (월별 세대수)만 그린다 — 지어낼 값이 하나도 없다. */}
        {/* 월별 입주 물량 — apartment_supply 실집계(월·세대수) */}
        <div className="chart-card text-primary" data-reveal="">
          <div className="chart-head">
            <span className="t-section text-ink">월별 입주 물량</span>
            <span className="t-caption ml-auto text-text-3">{scope}· 세대수 기준</span>
          </div>

          {/* 24개월을 세로 막대 한 장으로 먼저 보인다 — 아래 가로 막대 24줄은
              값을 정확히 읽는 자리지만, "물량이 언제 몰리는가"라는 모양은
              스크롤하며 읽어야 했다. 같은 데이터, 다른 축이다. */}
          {monthlyShown.length > 2 && (
            <Bars
              values={monthlyShown.map((b) => b.households)}
              labels={monthlyShown.map((b) => fmtYm(b.ym))}
              height={110}
              valueSuffix="세대"
              ariaLabel="월별 입주 세대수"
            />
          )}
          {monthlyShown.length > 0 && (
            <div className="kpi-row">
              <div className="kpi">
                <span className="kpi-k">합계</span>
                <span className="kpi-v">{totalHouseholds.toLocaleString("ko-KR")}세대</span>
                <span className="kpi-d">{scope}· {monthlyShown.length}개월</span>
              </div>
              {peak && (
                <div className="kpi">
                  <span className="kpi-k">가장 많은 달</span>
                  <span className="kpi-v">{fmtYm(peak.ym)}</span>
                  <span className="kpi-d">
                    {peak.households.toLocaleString("ko-KR")}세대 · {peak.count}곳
                  </span>
                </div>
              )}
              <div className="kpi">
                <span className="kpi-k">단지 수</span>
                <span className="kpi-v">{list.length.toLocaleString("ko-KR")}곳</span>
                <span className="kpi-d">현재 필터 기준</span>
              </div>
            </div>
          )}
          {monthlyShown.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {monthlyShown.map((b) => {
                const pct =
                  monthlyMax > 0
                    ? Math.max(2, Math.round((b.households / monthlyMax) * 100))
                    : 0;
                const isPeak = peak !== null && b.ym === peak.ym;
                return (
                  <div
                    key={b.ym}
                    className="row-hl grid grid-cols-[52px_1fr_92px] items-center gap-2 t-sub"
                  >
                    <span
                      className={`shrink-0 ${isPeak ? "font-extrabold text-primary" : "text-text-3"}`}
                    >
                      {fmtYm(b.ym)}
                    </span>
                    <span className={`rank-track ${isPeak ? "text-primary" : "text-primary"}`}>
                      <span
                        className="rank-fill"
                        style={{ width: `${pct}%`, opacity: isPeak ? 1 : 0.45 }}
                      />
                    </span>
                    <span className="shrink-0 text-right text-text-2">
                      {b.households.toLocaleString()}세대
                      <span className="ml-1 text-text-3">· {b.count}곳</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[10px] border border-line bg-surface px-4 py-8 text-center t-body text-text-3">
              표시할 월별 입주 물량 데이터가 없어요.
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
                <span className="t-sub text-text-3">
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
                  <span className="shrink-0 rounded-md bg-primary chip-pad t-sub font-extrabold text-white">
                    {monthLabel(s.moveInYm)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
                      <span className="truncate">{s.aptName ?? "미정"}</span>
                      {s.bizType && (
                        <span className="shrink-0 rounded bg-primary-soft px-[7px] py-0.5 t-caption font-extrabold text-primary">
                          {s.bizType}
                        </span>
                      )}
                    </div>
                    <div className="truncate t-sub text-text-3">
                      {s.households
                        ? `${s.households.toLocaleString()}세대 · `
                        : ""}
                      {s.address ?? s.region}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3.5">
                  <div className="text-right">
                    <div className="t-sub text-text-3">입주 예정</div>
                    <div className="t-body font-extrabold text-primary">
                      {fmtYm(s.moveInYm)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {featuredMore > 0 && (
              <p className="rise-in-2 px-1 t-sub text-text-3">
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
                  <span className="shrink-0 rounded-md bg-bg chip-pad t-sub font-extrabold text-text-2">
                    {monthLabel(s.moveInYm)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
                      <span className="truncate">{s.aptName ?? "미정"}</span>
                      {s.bizType && (
                        <span className="shrink-0 rounded bg-primary-soft px-[7px] py-0.5 t-caption font-extrabold text-primary">
                          {s.bizType}
                        </span>
                      )}
                    </div>
                    <div className="truncate t-sub text-text-3">
                      {s.households
                        ? `${s.households.toLocaleString()}세대 · `
                        : ""}
                      {s.address ?? s.region} · 입주 {fmtYm(s.moveInYm)}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 t-sub font-bold text-primary">
                  입주 {fmtYm(s.moveInYm)}
                </span>
              </div>
            ))}
            <p className="rise-in-3 px-1 t-sub text-text-3">
              {upcomingMore > 0
                ? `이번 분기·예정 카드는 대표 단지를 추려 보여드려요 (예정 외 ${upcomingMore.toLocaleString()}곳). 전체 목록은 아래 표에서 확인하세요.`
                : "이번 분기·예정 카드는 대표 단지를 추려 보여드려요 — 전체 목록은 아래 표에서 확인하세요."}
            </p>
          </>
        )}

        {/* 지난·전체 입주 예정 단지 — 곳수는 전량 기준(조용한 200 상한 정정),
            표는 200행에서 시작하고 "더 보기"로 펼친다 (상한을 가리지 않는다). */}
        <div className="rise-in-4 px-1 pt-1.5 text-xs font-extrabold text-text-3">
          {list.length > 0
            ? `지난·전체 입주 예정 단지 · ${list.length.toLocaleString()}곳`
            : "지난·전체 입주 예정 단지"}
        </div>
        {list.length === 0 ? (
          <div className="rise-in-4 card rounded-2xl px-4 py-8 text-center t-body text-text-3">
            해당 지역 입주 예정 물량 데이터가 없어요.
          </div>
        ) : (
          <div className="rise-in-4 card overflow-x-auto rounded-2xl px-[18px] py-1">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[1.8fr_.8fr_.8fr_.9fr] gap-2 border-b border-divider py-2 t-caption text-text-3">
                <span>단지 · 지역</span>
                <span className="text-center">입주월</span>
                <span className="text-center">세대수</span>
                <span className="text-center">사업유형</span>
              </div>
              {tableRows.map((item, i, arr) => (
                <div
                  key={`row-${item.aptName ?? "미정"}-${i}`}
                  className={`grid grid-cols-[1.8fr_.8fr_.8fr_.9fr] items-center gap-2 py-2.5 text-xs ${
                    i < arr.length - 1 ? "border-b border-divider" : ""
                  }`}
                >
                  <span className="truncate font-bold text-ink">
                    {item.aptName ?? "미정"}
                    <span className="ml-1 t-caption font-medium text-text-3">
                      {item.region}
                    </span>
                  </span>
                  <span className="text-center font-bold text-text-1">
                    {fmtYm(item.moveInYm)}
                  </span>
                  <span className="text-center font-bold text-text-1">
                    {item.households ? item.households.toLocaleString() : "—"}
                  </span>
                  <span className="text-center font-extrabold text-primary">
                    {item.bizType ?? "—"}
                  </span>
                </div>
              ))}
              {tableHiddenCount > 0 && (
                <div className="py-2">
                  <button
                    type="button"
                    onClick={() => setTableExpanded(true)}
                    className="press w-full rounded-lg border border-line bg-surface py-2 text-xs font-bold text-text-1"
                  >
                    나머지 {tableHiddenCount.toLocaleString()}곳 더 보기
                  </button>
                </div>
              )}
              <div className="pb-2 pt-1 t-caption text-text-3">
                출처 공공데이터(data.go.kr) 입주예정물량 · 수동 적재 데이터
                {asOfLabel ? ` (최근 적재 ${asOfLabel})` : ""} · 자동 갱신 없음
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 우측 사이드 (청약 센터 aside 구성) ── */}
      <aside className="flex flex-col gap-3.5">
        {/* AI 인사이트 패널 (실 수치 — 최다 입주 시기·총 세대수) */}
        <div className="rise-in-2">
          <AIPanel title="입주 물량 인사이트" className="rounded-[18px]">
            {monthly.length === 0 ? (
              <>
                표시할 입주 물량 데이터가 없어요. 지역을 바꾸거나 전국을 선택해
                보세요.
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
                  <span className="font-extrabold text-ai-accent">
                    {totalHouseholds.toLocaleString()}세대
                  </span>
                </div>
                {scope}기준{" "}
                <b className="text-ai-accent">{peak ? fmtYm(peak.ym) : "—"}</b>
                에 입주가 가장 몰려 있어요
                {peak ? ` (약 ${peak.households.toLocaleString()}세대)` : ""}.
                입주장에는 인근 전·월세 매물이 늘어 임차 협상에 유리할 수
                있어요.
              </>
            )}
          </AIPanel>
        </div>

        {/* 지역별 입주 요약 — 예전엔 ?region= 링크(서버 재렌더)였다. 이제 얕은
            pushState 버튼이라 서버 왕복이 없고, 활성 지역을 다시 누르면 전국으로
            돌아온다 (예전엔 전국으로 돌아갈 컨트롤 자체가 없었다). */}
        <div className="rise-in-3 card flex flex-col gap-1 rounded-[18px] p-[18px]">
          <div className="mb-1 t-body font-extrabold text-ink">
            지역별 입주 요약
          </div>
          {regions.length === 0 ? (
            <p className="t-caption text-text-3">
              표시할 지역 데이터가 없어요.
            </p>
          ) : (
            <>
              {regions.slice(0, regionsOpen ? regions.length : 5).map((r, i) => {
                const on = region === r.region;
                return (
                  <button
                    key={r.region}
                    type="button"
                    onClick={() => selectRegion(on ? null : r.region)}
                    aria-pressed={on}
                    className={`press flex w-full items-center justify-between rounded-lg px-1.5 py-[7px] text-left text-xs ${
                      on ? "bg-primary-soft" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2 font-bold text-ink">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft t-caption font-extrabold text-primary">
                        {i + 1}
                      </span>
                      {r.region}
                    </span>
                    <span className="text-text-2">
                      {r.households.toLocaleString()}세대 · {r.count}곳
                    </span>
                  </button>
                );
              })}
              {regions.length > 5 && (
                <button
                  type="button"
                  onClick={() => setRegionsOpen((v) => !v)}
                  aria-expanded={regionsOpen}
                  className="press mt-0.5 rounded-lg bg-bg py-1.5 text-center t-sub font-bold text-primary"
                >
                  {regionsOpen ? "상위 5개만 보기" : `지역 전체 보기 (${regions.length}곳)`}
                </button>
              )}
              {region !== null && (
                <button
                  type="button"
                  onClick={() => selectRegion(null)}
                  className="press mt-1 rounded-lg border border-line bg-surface py-1.5 t-sub font-bold text-text-1"
                >
                  전국 전체 보기
                </button>
              )}
              <p className="mt-1 t-caption text-text-3">
                지역을 선택하면 해당 지역 입주 물량만 볼 수 있어요.
              </p>
            </>
          )}
        </div>

        {/* AD 슬롯 — AdSlot 은 server-only 의존이 있어 서버 조각(prop)으로 받는다.
            유료 플랜 광고 제거는 plan={null} + AdFreeGate 클라이언트 게이트가 맡는다. */}
        <div className="rise-in-4">{adSlot}</div>
      </aside>
    </div>
  );
}
