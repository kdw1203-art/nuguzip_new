import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import {
  getSupplyRegions,
  getSupplyMonthly,
  getSupplyList,
} from "@/lib/market/supply";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "아파트 입주 예정 물량 | 누구집",
  description:
    "전국·지역별 아파트 입주 예정 물량(공급) 캘린더 — 입주월·단지·세대수. 공급이 많은 시기와 지역을 한눈에.",
  robots: { index: true, follow: true },
};

function fmtYm(ym: string): string {
  if (!/^\d{6}$/.test(ym)) return ym;
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
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

  return (
    <PageShell
      breadcrumb="홈 › 시장 › 입주 예정 물량"
      title="아파트 입주 예정 물량"
    >
      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        {active ? `${active} ` : "전국 "}입주 예정 단지{" "}
        <strong className="text-ink">{totalCount.toLocaleString()}곳</strong> ·{" "}
        <strong className="text-ink">
          {totalHouseholds.toLocaleString()}세대
        </strong>{" "}
        (2026.01~2027.12) · 출처 공개 입주예정물량 자료(2026.02 기준)
      </p>

      {/* 지역 필터 */}
      <section className="rise-in-1 mb-5 flex flex-wrap gap-1.5">
        <Link
          href="/supply"
          className={!active ? "chip-active" : "chip"}
        >
          전국
        </Link>
        {regions.map((r) => (
          <Link
            key={r.region}
            href={`/supply?region=${encodeURIComponent(r.region)}`}
            className={active === r.region ? "chip-active" : "chip"}
          >
            {r.region} {r.count}
          </Link>
        ))}
      </section>

      {/* 월별 물량 차트 */}
      {monthly.length > 0 && (
        <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            월별 입주 물량{" "}
            <span className="text-[11px] font-medium text-text-3">
              세대수 기준
            </span>
          </h2>
          <div className="mt-4 flex h-[120px] items-end gap-[3px] overflow-x-auto">
            {monthly.map((m) => (
              <div
                key={m.ym}
                className="flex min-w-[16px] flex-1 flex-col items-center gap-1"
                title={`${fmtYm(m.ym)} · ${m.count}곳 · ${m.households.toLocaleString()}세대`}
              >
                <div
                  className="w-full rounded-t-[3px] bg-primary-soft"
                  style={{
                    height: `${Math.max(4, (m.households / maxHh) * 100)}px`,
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-text-3">
            <span>{fmtYm(monthly[0]?.ym ?? "")}</span>
            <span>{fmtYm(monthly[monthly.length - 1]?.ym ?? "")}</span>
          </div>
        </section>
      )}

      {/* 단지 목록 */}
      <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">입주 예정 단지</h2>
        {list.length === 0 ? (
          <div className="mt-3 rounded-[12px] border border-line bg-surface px-4 py-8 text-center text-[13px] text-text-3">
            해당 지역 입주 예정 물량 데이터가 없어요.
          </div>
        ) : (
          <ul className="mt-2">
            {list.map((s, i) => (
              <li
                key={`${s.moveInYm}-${s.aptName}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
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
                    {s.address ?? ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[13px] font-extrabold text-ink">
                    {fmtYm(s.moveInYm)}
                  </div>
                  <div className="text-[11px] text-text-3">
                    {s.households ? `${s.households.toLocaleString()}세대` : "—"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rise-in-3 mb-4 flex flex-wrap gap-2">
        <Link
          href="/map"
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          지도에서 보기
        </Link>
        <Link
          href="/notifications"
          className="card card-hover px-5 py-3 text-[13px] font-bold text-ink"
        >
          입주 물량 알림 구독
        </Link>
      </section>

      <p className="mb-4 text-[11px] leading-[1.6] text-text-3">
        입주 예정 물량은 공개 자료를 취합한 참고용 정보이며, 사업 진행·일정 변경에 따라 실제와
        다를 수 있습니다.
      </p>
    </PageShell>
  );
}
