import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";
import { AdSlot } from "@/app/components/ads/AdSlot";
import { getAdViewer } from "@/lib/ads/viewer";
import {
  getSupplyRegions,
  getSupplyMonthly,
  getSupplyList,
  getSupplyDataAsOf,
} from "@/lib/market/supply";
import type { SupplyItem } from "@/lib/market/supply";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { seoAlternates } from "@/lib/seo/alternates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "아파트 입주 예정 물량 | 누구집",
  description:
    "전국·지역별 아파트 입주 예정 물량(공급) 캘린더 — 입주월·단지·세대수. 공급이 많은 시기와 지역을 한눈에.",
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/supply"),
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

/* ── 입주 캘린더(월 그리드)를 지운 이유 ──────────────────────────────────────
   이 자리에는 날짜 셀 42칸짜리 월 캘린더가 있었고, 매달 8·15·22·29일에 파란
   막대가 찍혀 있었다. 그 네 날짜는 데이터가 아니라 코드에 박아 둔 상수였다 —
   apartment_supply 는 `move_in_ym`(입주 **월**)까지만 가진 자료라 특정 일자를
   알 방법이 아예 없다. 옆에 "예시" 배지를 붙여 뒀지만, 캘린더는 날짜를
   말하려고 존재하는 물건이라 예시 배지 하나로 없는 일정이 있는 것처럼 보이는
   걸 막을 수 없었다.

   대신 실제로 가진 축(월별 세대수)을 그대로 그린다 — getSupplyMonthly 가
   `{ ym, count, households }` 를 돌려주므로 지어낼 값이 하나도 없다. */

/* H1 — 우측 사이드 광고 자리에는 "AD / AdSense 320×64" 라고 적힌 점선 상자가 있었다.
   개발용 자리표시자가 그대로 프로덕션에 나가 있던 것으로, 사용자에게는
   광고가 실릴 자리가 아니라 **깨진 광고**로 보인다. 실제 슬롯
   (`app/components/ads/AdSlot.tsx`)으로 교체한다 — 등록 배너가 있으면 배너를,
   없으면 하우스 광고를, 둘 다 없으면 `null` 을 반환해 **빈 상자를 남기지 않는다.** */

export default async function SupplyPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;
  const active = (region ?? "").trim() || undefined;
  // 유료 플랜 광고 제거(H4) — 이 페이지는 force-dynamic 이라 세션을 읽어도 비용이 없다
  const viewer = await getAdViewer();

  const [regions, monthly, list, dataAsOf] = await Promise.all([
    getSupplyRegions(),
    getSupplyMonthly(active),
    getSupplyList(active, 200),
    getSupplyDataAsOf(),
  ]);

  // 갱신 기준 표기 — 하드코딩 대신 DB(apartment_supply) 최신 적재 시점(created_at).
  // 자동 갱신 경로가 없는 수동 적재 데이터라는 사실을 함께 표기한다.
  const asOfLabel =
    dataAsOf && dataAsOf.length >= 7 ? `${dataAsOf.slice(0, 4)}.${dataAsOf.slice(5, 7)}` : null;

  const totalHouseholds = monthly.reduce((s, m) => s + m.households, 0);
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

  // 월별 물량 막대 — 앞으로 24개월치까지만(그 이후는 표본이 얇아 막대가 의미를 잃는다)
  const monthlyShown = monthly.slice(-24);
  const monthlyMax = monthlyShown.reduce((m, b) => Math.max(m, b.households), 0);

  return (
    <PageShell breadcrumb="동네이야기 › 입주 물량" wide>
      {/* 카테고리 줄 고정 — 여기서 바로 다른 카테고리로 넘어갈 수 있게 (뒤로가기 불필요) */}
      <TownCategoryNav stick />
      <div style={SUPPLY_THEME}>
        {/* 상단 CTA — 예전의 정적 탭 4개(전체·이번 분기·예정·지난 입주)는 클릭해도
            아무 동작이 없는 장식이라 제거했다. 섹션 구분은 아래 본문 제목으로 충분하다. */}
        {/* "입주 물량 알림" 칩은 뺐다 — /notifications 로 보내고 있었는데 그 화면은
            받은 알림을 읽는 알림함일 뿐, 입주 알림을 켜는 설정이 없다(알림 설정
            항목에도 입주 계열이 없다). 신청할 수 없는 알림을 신청 버튼처럼 걸어 두는
            것은 눌러도 아무 일이 없는 것보다 나쁘다 — 신청했다고 오해하게 만든다. */}
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
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
              href="/map"
              className="glass press rounded-full px-3.5 py-2 font-bold text-text-1 no-underline"
            >
              지도에서 보기
            </Link>
          </div>
        </div>

        {/* 정직 안내 배너 (초록 틴트) — 화면의 모든 수치가 실데이터가 된 뒤로는
            "예시 구성" 이라고 적을 것이 없다. 남은 사실(수동 적재·자동 갱신 없음)만 적는다. */}
        <div
          className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6]"
          style={{ color: "var(--primary-strong)" }}
        >
          <span>
            입주는 <b>월 단위</b>로 공개되는 자료라 일자는 알 수 없어요. 공개
            입주예정물량 자료를 수동으로 적재한 데이터
            {asOfLabel ? `(최근 적재 ${asOfLabel})` : ""}로 자동 갱신되지
            않으며, 사업 진행·일정 변경에 따라 실제와 다를 수 있어요. 아래
            “지난·전체 입주 예정 단지” 표는{" "}
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
            {/* 월별 입주 물량 — apartment_supply 실집계(월·세대수) */}
            <div className="rise-in-1 card flex flex-col gap-2.5 rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-ink">
                  월별 입주 물량
                </span>
                <span className="text-[11px] text-text-3">
                  {scope}· 세대수 기준
                </span>
              </div>
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
                        className="grid grid-cols-[52px_1fr_92px] items-center gap-2 text-[11px]"
                      >
                        <span
                          className={`shrink-0 ${isPeak ? "font-extrabold text-primary" : "text-text-3"}`}
                        >
                          {fmtYm(b.ym)}
                        </span>
                        <span className="h-2 w-full overflow-hidden rounded-full bg-bg">
                          <span
                            className={`block h-full rounded-full ${isPeak ? "bg-primary" : "bg-primary-soft"}`}
                            style={{ width: `${pct}%` }}
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
                <div className="rounded-[12px] border border-line bg-surface px-4 py-8 text-center text-[13px] text-text-3">
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
                    {/* "입주 알림 ›" 버튼이 있었지만 /notifications(알림함)로 갈 뿐
                        단지별 입주 알림을 켜는 기능은 없다. 상단 칩과 같은 이유로 뺐다. */}
                    <div className="flex shrink-0 items-center gap-3.5">
                      <div className="text-right">
                        <div className="text-[11px] text-text-3">입주 예정</div>
                        <div className="text-[13px] font-extrabold text-primary">
                          {fmtYm(s.moveInYm)}
                        </div>
                      </div>
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
                    {/* "입주 알림 받기 ›" — 같은 이유로 제거(받을 수 있는 알림이 아니다).
                        카드가 이미 입주월을 적고 있어 잃는 정보는 없다. */}
                    <span className="shrink-0 text-[11px] font-bold text-primary">
                      입주 {fmtYm(s.moveInYm)}
                    </span>
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
                  <div className="pb-2 pt-1 text-[10px] text-text-3">
                    출처 공공데이터(data.go.kr) 입주예정물량 · 수동 적재
                    데이터{asOfLabel ? ` (최근 적재 ${asOfLabel})` : ""} · 자동
                    갱신 없음
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── 우측 사이드 (청약 센터 aside 구성) ── */}
          <aside className="flex flex-col gap-3.5">
            {/* AI 인사이트 패널 (실 수치 — 최다 입주 시기·총 세대수) */}
            <div className="rise-in-2">
              {/* 제목이 "입주 물량 인사이트 (예시)" 였는데 이 안의 수치는 전부
                  apartment_supply 실집계다. 진짜 숫자에 "예시" 를 붙이면 반대 방향의
                  거짓말이 된다 — 믿어도 되는 값을 못 믿게 만든다. */}
              <AIPanel title="입주 물량 인사이트" className="rounded-[18px]">
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

        {/* 면책 (초록 톤 유지) */}
        <p className="mt-6 text-[11px] leading-[1.6] text-text-3">
          입주 예정 물량은 공개 자료를 취합한 참고용 정보이며, 사업 진행·일정
          변경에 따라 실제와 다를 수 있습니다.
        </p>
      </div>
    </PageShell>
  );
}
