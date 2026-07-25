import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
import { getRegionSeries } from "@/lib/market/store";
import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
} from "@/lib/map/seoul-districts";
import { TimingRegionSelect } from "./region-select";
import { TimingComplexPicker } from "./complex-picker";

export const dynamic = "force-dynamic";

/* ============================================================
   시세·타이밍 분석
   - 지역 선택 → 실제 매매가격지수 시리즈(getRegionSeries) 기반
     추세·모멘텀 규칙 판정 (실데이터 영역)
   - 하드코딩 "매수 신호 62/100"·사이클·거래량 패널은 실데이터가
     없어 제거 (허구 수치 금지 정책)
   ============================================================ */

const REGION_OPTIONS = [
  ...SEOUL_DISTRICTS.map((d) => ({ id: d.id, label: `서울 ${d.name}`, name: d.name })),
  ...METRO_EXPLORE_DISTRICTS.map((d) => ({
    id: d.id,
    label: `${d.city ?? "서울"} ${d.name}`,
    name: d.name,
  })),
];

type SeriesPoint = { period: string; value: number };

type TrendResult = {
  verdict: string;
  detail: string;
  points: SeriesPoint[];
  changes: number[];
  periodType: "monthly" | "weekly";
  latestChangePct: number;
  cumulativePct: number;
};

function pctChanges(points: SeriesPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1].value;
    out.push(prev ? ((points[i].value - prev) / prev) * 100 : 0);
  }
  return out;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** 추세/모멘텀 규칙 판정 — 최근 3구간 평균 변동 vs 직전 3구간 비교 */
function judgeTrend(points: SeriesPoint[], periodType: "monthly" | "weekly"): TrendResult | null {
  if (points.length < 4) return null;
  const changes = pctChanges(points);
  const recent = mean(changes.slice(-3));
  const prior = mean(changes.slice(-6, -3));
  const latest = changes[changes.length - 1] ?? 0;
  const cumulative = points[0].value
    ? ((points[points.length - 1].value - points[0].value) / points[0].value) * 100
    : 0;
  const unit = periodType === "monthly" ? "월" : "주";
  const th = periodType === "monthly" ? 0.15 : 0.05;

  let verdict: string;
  let detail: string;
  if (recent > th && recent >= prior) {
    verdict = "상승 지속";
    detail = `최근 3개${unit} 평균 +${recent.toFixed(2)}%로 직전(${prior >= 0 ? "+" : ""}${prior.toFixed(2)}%)보다 강한 상승 흐름이에요.`;
  } else if (recent > th && recent < prior) {
    verdict = "상승 둔화";
    detail = `상승세가 이어지지만 폭이 ${prior.toFixed(2)}% → ${recent.toFixed(2)}%로 줄었어요. 고점 추격은 신중히.`;
  } else if (recent < -th && recent <= prior) {
    verdict = "하락 지속";
    detail = `최근 3개${unit} 평균 ${recent.toFixed(2)}%로 조정이 이어지고 있어요. 급매 중심으로 관찰할 시기예요.`;
  } else if (recent < -th && recent > prior) {
    verdict = "하락 둔화";
    detail = `하락 폭이 ${prior.toFixed(2)}% → ${recent.toFixed(2)}%로 줄었어요. 바닥 다지기 가능성을 지켜보세요.`;
  } else if (prior < -th && recent >= -th) {
    verdict = "반등 조짐";
    detail = `직전 조정(${prior.toFixed(2)}%) 이후 최근 흐름이 보합권(${recent >= 0 ? "+" : ""}${recent.toFixed(2)}%)으로 돌아섰어요.`;
  } else {
    verdict = "보합권";
    detail = `최근 3개${unit} 평균 변동이 ${recent >= 0 ? "+" : ""}${recent.toFixed(2)}%로 뚜렷한 방향성이 없어요.`;
  }
  return {
    verdict,
    detail,
    points,
    changes,
    periodType,
    latestChangePct: latest,
    cumulativePct: cumulative,
  };
}

async function loadTrend(regionId: string): Promise<TrendResult | null> {
  try {
    // 12개월 지수 (13개 값 → 12개 변동) 우선, 없으면 주간 시리즈로 대체
    const monthly = await getRegionSeries(regionId, "sale_index", "monthly", 13);
    if (monthly.length >= 4) return judgeTrend(monthly, "monthly");
    const weekly = await getRegionSeries(regionId, "sale_index", "weekly", 27);
    if (weekly.length >= 4) return judgeTrend(weekly, "weekly");
    return null;
  } catch {
    return null;
  }
}

function periodLabel(period: string): string {
  // "2025-07-01" → "25.07"
  const m = /^(\d{4})-(\d{2})/.exec(period);
  return m ? `${m[1].slice(2)}.${m[2]}` : period;
}

export default async function TimingPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; complexId?: string; apt?: string }>;
}) {
  const { region, complexId, apt } = await searchParams;
  const selected =
    REGION_OPTIONS.find((r) => r.id === region) ?? REGION_OPTIONS[0];
  const trend = await loadTrend(selected.id);

  return (
    <PageShell breadcrumb="AI 분석 › 시세·타이밍">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">시세·타이밍 분석</h1>
        <div className="flex flex-wrap items-end gap-2">
          <TimingComplexPicker
            initialComplexId={complexId ?? null}
            initialApt={apt ?? null}
            currentRegion={selected.id}
          />
          <TimingRegionSelect
            options={REGION_OPTIONS.map((r) => ({ id: r.id, label: r.label }))}
            value={selected.id}
          />
        </div>
      </div>

      {/* ── 실데이터 영역: 실제 지수 시리즈 기반 추세·모멘텀 판정 ── */}
      <div className="rise-in mb-4 card flex flex-col gap-3 rounded-[20px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-base font-extrabold text-ink">
            {selected.label} 매매가격지수 추세
          </div>
          <span className="rounded border border-line px-1.5 py-px text-[9px] font-bold text-text-3">
            실데이터 기준
          </span>
        </div>

        {trend ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-[10px] bg-primary-soft px-3 py-1.5 text-sm font-extrabold text-primary">
                {trend.verdict}
              </span>
              <span className="text-xs text-text-2">
                최근 변동 {trend.latestChangePct >= 0 ? "▲" : "▼"}
                {Math.abs(trend.latestChangePct).toFixed(2)}% · 기간 누적{" "}
                {trend.cumulativePct >= 0 ? "+" : ""}
                {trend.cumulativePct.toFixed(1)}%
                {trend.periodType === "weekly" ? " (주간 지수 대체)" : " (12개월 지수)"}
              </span>
            </div>
            <div className="text-[13px] leading-[1.6] text-text-1">{trend.detail}</div>

            {/* 지수 미니 차트 (실데이터) */}
            <div className="flex h-[120px] items-end gap-1 border-b border-line pb-px">
              {(() => {
                const vals = trend.points.map((p) => p.value);
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                const span = max - min || 1;
                return trend.points.map((p, i) => {
                  const h = 18 + Math.round(((p.value - min) / span) * 82);
                  const isLast = i === trend.points.length - 1;
                  return (
                    <div
                      key={p.period}
                      title={`${p.period} · ${p.value.toFixed(1)}`}
                      className="flex-1 rounded-t-[3px]"
                      style={{
                        height: `${h}%`,
                        background: isLast ? "#1d4fd8" : "#c9d4e5",
                      }}
                    />
                  );
                });
              })()}
            </div>
            <div className="flex justify-between text-[10px] text-text-3">
              <span>{periodLabel(trend.points[0].period)}</span>
              <span>{periodLabel(trend.points[trend.points.length - 1].period)}</span>
            </div>
            <div className="text-[9px] leading-[1.5] text-text-3">
              규칙 기반 판정 · 본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
            </div>
          </>
        ) : (
          <div className="rounded-[12px] bg-bg px-3 py-3 text-xs text-text-3">
            {selected.label}의 지수 시계열 데이터가 아직 없어요. 다른 지역을 선택하거나
            데이터 수집 후 다시 확인해 주세요.
          </div>
        )}
      </div>

      {/* 사이클·매수 신호·거래량 패널은 실데이터가 없어 제공하지 않습니다.
          거래량·사이클 데이터가 연동되면 실측 기반으로 다시 제공할 예정. */}
      <div className="rise-in-1 card flex flex-col gap-1.5 rounded-[20px] p-5">
        <div className="text-sm font-extrabold text-ink">
          매수 신호·사이클 분석은 준비 중이에요
        </div>
        <div className="text-[12px] leading-relaxed text-text-3">
          거래량·사이클 기반 매수 신호는 실데이터 연동 후 제공될 예정이에요. 지금은 위의
          매매가격지수 추세 판정(실데이터)을 참고해 주세요.
        </div>
      </div>

      {/* 15h-44 분석→행동: 결과 끝 다음 행동 카드 */}
      <div className="mt-5">
        <NextActions
          actions={[
            { label: "알림 기준 설정", href: "/notifications", primary: true },
            { label: "시나리오 확인", href: "/analysis/scenario" },
          ]}
        />
      </div>
    </PageShell>
  );
}
