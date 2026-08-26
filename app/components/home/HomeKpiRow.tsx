import Link from "next/link";
import { HomeLevelKpi } from "./HomeLevelKpi";

/* 홈 리디자인(#408) 시안 A — KPI 4칸.
 * ① 대표 지역 평균(실거래 스냅샷) ② 시장 온도(주간 아카이브)
 * ③ 거래량(같은 스냅샷의 최근 거래 건수) ④ 내 임장 레벨(클라이언트 —
 * 로그인 시 실측 레벨, 비로그인은 시작 CTA).
 *
 * 사실 우선: 값이 없는 칸은 "—"가 아니라 **칸 자체를 뺀다**(그리드가 접힌다).
 * 단 ④는 상태(비로그인/로딩/실측)가 곧 내용이라 항상 그린다.
 */

export interface KpiRegion {
  name: string;
  price: string;
  delta: string;
  tone: "up" | "down" | "flat";
  /** meta 에서 뽑은 최근 거래 건수 문자열 (예: "120건") — 없으면 null */
  tradeLabel: string | null;
  href: string;
}

export interface KpiTemp {
  score: number;
  headline: string;
  weekLabel: string;
}

const toneClass: Record<KpiRegion["tone"], string> = {
  up: "text-primary",
  down: "text-danger",
  flat: "text-text-3",
};

export function HomeKpiRow({
  region,
  temp,
}: {
  region: KpiRegion | null;
  temp: KpiTemp | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
      {region && (
        <Link
          href={region.href}
          className="card tile flex flex-col gap-0.5 rounded-2xl px-4 py-3 no-underline"
        >
          <span className="t-caption font-bold text-text-3">{region.name} 평균</span>
          <span className="text-[19px] font-extrabold leading-tight text-ink tabular-nums">
            {region.price}
          </span>
          <span className={`text-[11px] font-extrabold ${toneClass[region.tone]}`}>
            {region.delta}
          </span>
        </Link>
      )}
      {temp && (
        <Link
          href="/analysis/temperature"
          className="card tile flex flex-col gap-0.5 rounded-2xl px-4 py-3 no-underline"
        >
          <span className="t-caption font-bold text-text-3">
            시장 온도 · {temp.weekLabel}
          </span>
          <span className="text-[19px] font-extrabold leading-tight text-ink tabular-nums">
            {temp.score}
            <span className="text-[11px] text-text-3">/100</span>
          </span>
          <span className="truncate text-[11px] font-bold text-text-2">{temp.headline}</span>
        </Link>
      )}
      {region?.tradeLabel && (
        <Link
          href="/analysis/price"
          className="card tile flex flex-col gap-0.5 rounded-2xl px-4 py-3 no-underline"
        >
          <span className="t-caption font-bold text-text-3">{region.name} 최근 거래</span>
          <span className="text-[19px] font-extrabold leading-tight text-ink tabular-nums">
            {region.tradeLabel}
          </span>
          <span className="text-[11px] font-bold text-text-2">면적대별 실거래 ›</span>
        </Link>
      )}
      <HomeLevelKpi />
    </div>
  );
}
