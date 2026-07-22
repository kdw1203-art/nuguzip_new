import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
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
  const maxHh = Math.max(1, ...monthly.map((m) => m.households));
  const peak =
    monthly.length > 0
      ? monthly.reduce((a, b) => (b.households > a.households ? b : a))
      : null;
  const groups = groupByQuarter(list);
  const topN = Math.min(3, regions.length);
  const scope = active ? `${active} ` : "전국 ";

  return (
    <PageShell breadcrumb="동네이야기 › 입주 물량" wide>
      <div style={SUPPLY_THEME}>
        <h1 className="rise-in t-title mb-3 text-ink">아파트 입주 예정 물량</h1>

        {/* 상단 지역 필터 pill 탭 (청약 센터 탭 패턴 · 초록 테마) */}
        <nav
          aria-label="지역 필터"
          className="rise-in mb-3 flex flex-wrap gap-1.5 text-[13px]"
        >
          <Link
            href="/supply"
            aria-current={!active ? "page" : undefined}
            style={!active ? { color: "#fff" } : undefined}
            className={
              !active
                ? "press rounded-full bg-primary px-3.5 py-2 font-bold no-underline"
                : "glass press rounded-full px-3.5 py-2 font-semibold text-text-2 no-underline"
            }
          >
            전국
          </Link>
          {regions.map((r) => {
            const on = active === r.region;
            return (
              <Link
                key={r.region}
                href={`/supply?region=${encodeURIComponent(r.region)}`}
                aria-current={on ? "page" : undefined}
                style={on ? { color: "#fff" } : undefined}
                className={
                  on
                    ? "press rounded-full bg-primary px-3.5 py-2 font-bold no-underline"
                    : "glass press rounded-full px-3.5 py-2 font-semibold text-text-2 no-underline"
                }
              >
                {r.region}{" "}
                <span className={on ? "opacity-80" : "text-text-3"}>
                  {r.count}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* 요약 라인 + CTA 칩 (청약 센터 top row 패턴) */}
        <div className="rise-in mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-[13px] leading-[1.6] text-text-2">
            {scope}입주 예정 단지{" "}
            <strong className="text-ink">
              {totalCount.toLocaleString()}곳
            </strong>{" "}
            ·{" "}
            <strong className="text-ink">
              {totalHouseholds.toLocaleString()}세대
            </strong>{" "}
            (2026.01~2027.12)
          </p>
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
              입주 물량 알림 받기
            </Link>
            <Link
              href="/map"
              className="glass press rounded-full px-3.5 py-2 font-bold text-text-1 no-underline"
            >
              지도에서 보기
            </Link>
          </div>
        </div>

        {/* 출처 안내 배너 (초록 틴트) */}
        <div className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6] text-primary-strong">
          <span>
            공개 입주예정물량 자료(2026.02 기준)를 취합한 참고 정보예요. 사업
            진행·일정 변경에 따라 실제와 다를 수 있어요.
          </span>
        </div>

        {/* 2단 레이아웃 (청약 센터: 본문 + 우측 사이드) */}
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          {/* ── 본문: 월별 차트 + 분기별 단지 목록 ── */}
          <div className="flex flex-col gap-4">
            {/* 월별 물량 차트 */}
            <section className="rise-in-1 card p-[var(--pad-card)]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-extrabold text-ink">
                  월별 입주 물량{" "}
                  <span className="text-[11px] font-medium text-text-3">
                    세대수 기준
                  </span>
                </h2>
                {peak && (
                  <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">
                    피크 {fmtYm(peak.ym)}
                  </span>
                )}
              </div>
              {monthly.length > 0 ? (
                <>
                  <div className="mt-4 flex h-[120px] items-end gap-[3px] overflow-x-auto">
                    {monthly.map((m) => {
                      const isPeak = peak != null && m.ym === peak.ym;
                      return (
                        <div
                          key={m.ym}
                          className="flex min-w-[16px] flex-1 flex-col items-center gap-1"
                          title={`${fmtYm(m.ym)} · ${m.count}곳 · ${m.households.toLocaleString()}세대`}
                        >
                          <div
                            className={`w-full rounded-t-[3px] ${
                              isPeak ? "bg-primary" : "bg-primary-soft"
                            }`}
                            style={{
                              height: `${Math.max(4, (m.households / maxHh) * 100)}px`,
                              border: "1px solid var(--primary-strong)",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1 flex justify-between text-[9px] text-text-3">
                    <span>{fmtYm(monthly[0]?.ym ?? "")}</span>
                    <span>{fmtYm(monthly[monthly.length - 1]?.ym ?? "")}</span>
                  </div>
                </>
              ) : (
                <div className="mt-3 rounded-[12px] border border-line bg-surface px-4 py-8 text-center text-[13px] text-text-3">
                  월별 입주 물량 데이터가 없어요.
                </div>
              )}
            </section>

            {/* 분기별 단지 목록 (청약 센터의 섹션형 카드) */}
            <section className="rise-in-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-[15px] font-extrabold text-ink">
                  입주 예정 단지
                </h2>
                {list.length > 0 && (
                  <span className="text-[11px] text-text-3">
                    {list.length.toLocaleString()}곳 표시
                  </span>
                )}
              </div>

              {list.length === 0 ? (
                <div className="card rounded-2xl px-4 py-8 text-center text-[13px] text-text-3">
                  해당 지역 입주 예정 물량 데이터가 없어요.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {groups.map((g) => (
                    <div key={g.key}>
                      <div className="mb-2 flex items-baseline justify-between px-1">
                        <span className="text-xs font-extrabold text-text-3">
                          {g.label}
                        </span>
                        <span className="text-[11px] text-text-3">
                          {g.items.length}곳 ·{" "}
                          {g.households.toLocaleString()}세대
                        </span>
                      </div>
                      <div className="card rounded-2xl px-[18px] py-1">
                        {g.items.map((s, i, arr) => (
                          <div
                            key={`${g.key}-${s.aptName ?? "미정"}-${i}`}
                            className={`flex items-center justify-between gap-3 py-3 ${
                              i < arr.length - 1
                                ? "border-b border-divider"
                                : ""
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="shrink-0 rounded-md bg-primary-soft px-2 py-1 text-[11px] font-extrabold text-primary">
                                {monthLabel(s.moveInYm)}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-bold text-ink">
                                  {s.aptName ?? "미정"}
                                  {s.bizType ? (
                                    <span className="ml-1.5 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                      {s.bizType}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-0.5 truncate text-[11px] text-text-3">
                                  {s.address ?? s.region}
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[13px] font-extrabold text-ink">
                                {s.households
                                  ? `${s.households.toLocaleString()}세대`
                                  : "—"}
                              </div>
                              <div className="text-[11px] text-text-3">
                                {s.region}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ── 우측 사이드: 요약·인사이트 카드 ── */}
          <aside className="flex flex-col gap-3.5">
            {/* 물량 요약 */}
            <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
              <div className="text-[13px] font-extrabold text-ink">
                {scope}입주 물량 요약
              </div>
              {monthly.length === 0 ? (
                <p className="text-[12px] leading-[1.6] text-text-3">
                  요약할 데이터가 없어요.
                </p>
              ) : (
                <>
                  <div className="rounded-xl bg-primary-soft px-3.5 py-3">
                    <div className="text-[11px] text-primary-strong">
                      최다 입주 시기
                    </div>
                    <div className="mt-0.5 text-[18px] font-extrabold text-primary">
                      {peak ? fmtYm(peak.ym) : "—"}
                    </div>
                    {peak && (
                      <div className="mt-0.5 text-[10px] text-primary-strong">
                        {peak.households.toLocaleString()}세대 · {peak.count}곳
                        입주
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-divider pt-2.5 text-xs">
                    <span className="text-text-2">총 예정 단지</span>
                    <span className="font-extrabold text-ink">
                      {totalCount.toLocaleString()}곳
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-2">총 예정 세대</span>
                    <span className="font-extrabold text-ink">
                      {totalHouseholds.toLocaleString()}세대
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* 물량 많은 지역 TOP */}
            {regions.length > 0 && (
              <div className="rise-in-3 card flex flex-col gap-1 rounded-[18px] p-[18px]">
                <div className="mb-1 text-[13px] font-extrabold text-ink">
                  물량 많은 지역 TOP{topN}
                </div>
                {regions.slice(0, 3).map((r, i) => {
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
                  지역을 선택하면 해당 지역 물량만 볼 수 있어요.
                </p>
              </div>
            )}

            {/* 알림 CTA */}
            <div className="rise-in-4 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
              <div className="text-[13px] font-extrabold text-ink">
                입주 물량 알림
              </div>
              <p className="text-[11px] leading-[1.6] text-text-2">
                관심 지역에 신규 입주 예정 단지가 등록되면 알려드려요.
              </p>
              <Link
                href="/notifications"
                className="btn-primary press rounded-[10px] px-4 py-[11px] text-center text-xs no-underline"
              >
                알림 받기 ›
              </Link>
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
