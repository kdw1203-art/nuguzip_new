import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
import { getRegionSeries, getRegionMonthlyVolume, type RegionMonthlyVolumeRow } from "@/lib/market/store";
import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
} from "@/lib/map/seoul-districts";
import { TimingRegionSelect } from "./region-select";
import { TimingComplexPicker } from "./complex-picker";

export const dynamic = "force-dynamic";

/* ============================================================
   시세·타이밍 분석 — 전 구간 실데이터.
   - 상단: 지역 선택 → 실제 매매가격지수 시리즈(getRegionSeries) 기반
     추세·모멘텀 규칙 판정
   - 하단 좌: 월별 매매 거래량(market_region_monthly 실측)
   - 하단 우: 시장 온도 = 지수 모멘텀 + 거래량 추이 합성 (규칙 기반)
   예전의 하드코딩 사이클 그림·"매수 신호 62/100"은 제거했다 — 구체적인
   숫자는 실측처럼 읽히므로, 실측이 아니면 그리지 않는다.
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

/* ============================================================
   시장 온도 신호 — 실측치 2개(지수 모멘텀 · 거래량 추이)의 합성.
   예전 이 자리에는 하드코딩된 "매수 신호 62/100"과 지어낸 근거 3줄
   ("거래량 회복 초기", "하락 폭 -4.1→-2.1%", "금리 동결 전망")이 있었다.
   숫자가 구체적일수록 실측처럼 읽히므로, 실측이 아니면 아예 그리지 않는다.
   금리는 우리가 관측하는 데이터가 아니라서 입력에서 뺐다.
   ============================================================ */

type MarketTemp = {
  score: number;
  headline: string;
  inputs: { label: string; value: string; accent: boolean }[];
  volumeNote: string | null;
};

function currentYyyymm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 시장 온도(0~100) — 50이 중립. 지수 모멘텀 ±25점 + 거래량 추이 ±25점.
 * 거래량은 신고 지연이 있는 이번 달을 제외하고, 완결월 4개 이상일 때만 반영한다.
 */
function computeMarketTemp(
  trend: TrendResult | null,
  volume: RegionMonthlyVolumeRow[],
): MarketTemp | null {
  if (!trend) return null;
  const unit = trend.periodType === "monthly" ? "월" : "주";
  const recent = mean(trend.changes.slice(-3));
  const prior = mean(trend.changes.slice(-6, -3));
  // 월 ±1% 변동을 ±25점 만점으로 환산 (주간이면 ±0.3%)
  const momScale = trend.periodType === "monthly" ? 25 : 83;
  const momPts = clamp(recent * momScale, -25, 25);

  const inputs: MarketTemp["inputs"] = [
    {
      label: `지수 최근 3개${unit} 평균`,
      value: `${recent >= 0 ? "+" : ""}${recent.toFixed(2)}%`,
      accent: recent > 0,
    },
    {
      label: `직전 3개${unit} 평균`,
      value: `${prior >= 0 ? "+" : ""}${prior.toFixed(2)}%`,
      accent: false,
    },
  ];

  // 거래량: 이번 달(신고 지연) 제외한 완결월만
  const nowYm = currentYyyymm();
  const complete = volume.filter((v) => v.month < nowYm);
  let volPts = 0;
  let volumeNote: string | null = null;
  if (complete.length >= 4) {
    const half = Math.min(3, Math.floor(complete.length / 2));
    const recentMonths = complete.slice(-half);
    const priorMonths = complete.slice(-half * 2, -half);
    const recentSum = recentMonths.reduce((s, v) => s + v.count, 0);
    const priorSum = priorMonths.reduce((s, v) => s + v.count, 0);
    if (priorSum > 0) {
      const deltaPct = ((recentSum - priorSum) / priorSum) * 100;
      volPts = clamp(deltaPct * 0.5, -25, 25); // ±50% 변화를 ±25점으로
      inputs.push({
        label: `거래량 최근 ${half}개월 합`,
        value: `${recentSum.toLocaleString("ko-KR")}건 (직전 ${priorSum.toLocaleString("ko-KR")}건, ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(0)}%)`,
        accent: deltaPct > 0,
      });
    }
  } else {
    volumeNote =
      complete.length > 0
        ? `거래량 완결월이 ${complete.length}개뿐이라 신호에는 지수 모멘텀만 반영했어요.`
        : "이 지역의 월별 거래량 집계가 아직 없어 신호에는 지수 모멘텀만 반영했어요.";
  }

  const score = Math.round(clamp(50 + momPts + volPts, 5, 95));
  const headline =
    score >= 65
      ? "가격·거래 모두 달아오르는 구간"
      : score >= 55
        ? "완만한 회복 흐름"
        : score >= 45
          ? "방향성 탐색 구간"
          : score >= 35
            ? "조정 흐름 지속"
            : "가격·거래 모두 식은 구간";
  return { score, headline, inputs, volumeNote };
}

export default async function TimingPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; complexId?: string; apt?: string }>;
}) {
  const { region, complexId, apt } = await searchParams;
  const selected =
    REGION_OPTIONS.find((r) => r.id === region) ?? REGION_OPTIONS[0];
  const [trend, volume] = await Promise.all([
    loadTrend(selected.id),
    getRegionMonthlyVolume(selected.id, selected.name, 12),
  ]);
  const temp = computeMarketTemp(trend, volume);
  const nowYm = currentYyyymm();
  const maxVolCount = Math.max(1, ...volume.map((v) => v.count));

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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]">
        {/* ── 월별 거래량 (실데이터) — 예전 이 자리의 "관양동 시세 사이클"은
              좌표를 손으로 찍은 그림이었다. 실측 거래량 막대로 교체. ── */}
        <div className="rise-in-1 card flex flex-col gap-4 rounded-[20px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-base font-extrabold text-ink">
              {selected.label} 월별 매매 거래량
            </div>
            <span className="rounded border border-line px-1.5 py-px text-[9px] font-bold text-text-3">
              실데이터 기준
            </span>
          </div>
          {volume.length > 0 ? (
            <>
              <div className="flex h-[200px] items-end gap-2 border-b border-line pb-px">
                {volume.map((v) => {
                  const h = 8 + Math.round((v.count / maxVolCount) * 88);
                  const isCurrentMonth = v.month >= nowYm;
                  return (
                    <div key={v.month} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-bold text-text-2">
                        {v.count.toLocaleString("ko-KR")}
                      </span>
                      <div
                        title={`${v.month.slice(0, 4)}.${v.month.slice(4)} · ${v.count}건`}
                        className="w-full rounded-t-[4px]"
                        style={{
                          height: `${h}%`,
                          background: isCurrentMonth ? "#c9d4e5" : "#1d4fd8",
                        }}
                      />
                      <span className="text-[10px] text-text-3">
                        {v.month.slice(2, 4)}.{v.month.slice(4)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] leading-[1.5] text-text-3">
                국토교통부 실거래 집계 · 이번 달(연한 막대)과 직전 월은 신고 지연(계약 후
                30일 이내 신고)으로 실제보다 적게 표시될 수 있어요.
              </div>
            </>
          ) : (
            <div className="rounded-[12px] bg-bg px-3 py-3 text-xs text-text-3">
              {selected.label}의 월별 거래량 집계가 아직 없어요. 실거래 수집이 쌓이면
              자동으로 표시됩니다.
            </div>
          )}
        </div>

        {/* 우측 */}
        <div className="flex flex-col gap-4">
          {temp ? (
            <div className="rise-in-2 ai-panel flex flex-col gap-3 rounded-[20px] p-[22px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="ai-chip h-[22px] w-[22px] rounded-[7px] text-[11px]">AI</span>
                  <span className="text-sm font-extrabold text-white">시장 온도</span>
                </div>
                <span className="rounded border border-[rgba(255,255,255,.25)] px-1.5 py-px text-[9px] font-bold text-ai-muted">
                  규칙 기반 · 실데이터 입력
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[5px] text-base font-extrabold text-ai-accent"
                  style={{
                    borderColor: "rgba(126,162,255,.25)",
                    borderTopColor: "#7ea2ff",
                    borderRightColor: "#7ea2ff",
                  }}
                >
                  {temp.score}
                </div>
                <div className="text-xs leading-[1.6] text-ai-text">
                  {selected.label} 시장 온도 {temp.score}/100 —{" "}
                  <b className="text-white">{temp.headline}</b>. 50이 중립이며, 아래
                  실측 지표에서 계산됩니다.
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {temp.inputs.map((s) => (
                  <div
                    key={s.label}
                    className="flex justify-between gap-2 rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs"
                  >
                    <span className="shrink-0 text-ai-muted">{s.label}</span>
                    <span className={`text-right font-bold ${s.accent ? "text-ai-accent" : "text-ai-text"}`}>
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
              {temp.volumeNote && (
                <div className="text-[10px] leading-[1.5] text-ai-muted">{temp.volumeNote}</div>
              )}
              <div className="text-[9px] leading-[1.5] text-ai-muted">
                지수 모멘텀(±25점)과 거래량 추이(±25점)를 50점 기준에 더한 값입니다.
                매수·매도 추천이 아니며, 본 분석은 참고용으로 투자 판단의 책임은
                이용자에게 있습니다.
              </div>
            </div>
          ) : (
            <div className="rise-in-2 card rounded-[20px] p-5 text-xs text-text-3">
              이 지역은 지수 시계열이 아직 없어 시장 온도를 계산할 수 없어요.
            </div>
          )}

          <div className="rise-in-3 card flex flex-col gap-2 rounded-[20px] p-5">
            <div className="text-sm font-extrabold text-ink">알림 설정</div>
            <div className="text-[12px] leading-[1.6] text-text-2">
              관심 지역의 실거래 등록·시세 변동 알림을 받아보세요.
            </div>
            <Link
              href="/notifications"
              className="btn-soft mt-1 rounded-[10px] p-2.5 text-center text-xs no-underline"
            >
              알림 설정 열기
            </Link>
          </div>
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
