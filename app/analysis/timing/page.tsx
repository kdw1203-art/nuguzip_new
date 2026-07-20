import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
import { SimulationNotice } from "../../components/ExampleBadge";
import { getRegionSeries } from "@/lib/market/store";
import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
} from "@/lib/map/seoul-districts";
import { TimingRegionSelect } from "./region-select";

export const dynamic = "force-dynamic";

/* ============================================================
   시세·타이밍 분석
   - 상단: 지역 선택 → 실제 매매가격지수 시리즈(getRegionSeries) 기반
     추세·모멘텀 규칙 판정 (실데이터 영역 — 예시 배지 없음)
   - 하단: 사이클/신호 시뮬레이션 (예시 배지 유지)
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

const SEGMENTS = [
  { left: "0%", bottom: "20%", width: "14%", color: "#c9d4e5", rotate: 0 },
  { left: "14%", bottom: "32%", width: "16%", color: "#c9d4e5", rotate: -8 },
  { left: "30%", bottom: "52%", width: "18%", color: "#8fa8dd", rotate: -14 },
  { left: "48%", bottom: "66%", width: "16%", color: "#8fa8dd", rotate: 0 },
  { left: "64%", bottom: "56%", width: "16%", color: "#1d4fd8", rotate: 10 },
  { left: "80%", bottom: "46%", width: "14%", color: "#1d4fd8", rotate: 4 },
] as const;

const SIGNALS = [
  { label: "거래량 (3개월)", value: "▲ 회복 초기", accent: true },
  { label: "하락 폭", value: "둔화 (-4.1→-2.1%)", accent: true },
  { label: "금리 방향", value: "동결 전망", accent: false },
] as const;

const ALERTS = ["신호 70 도달 시 알림", "관양동 급매 등록 시 알림"];

export default async function TimingPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;
  const selected =
    REGION_OPTIONS.find((r) => r.id === region) ?? REGION_OPTIONS[0];
  const trend = await loadTrend(selected.id);

  return (
    <PageShell breadcrumb="AI 분석 › 시세·타이밍">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">시세·타이밍 분석</h1>
        <TimingRegionSelect
          options={REGION_OPTIONS.map((r) => ({ id: r.id, label: r.label }))}
          value={selected.id}
        />
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
            <div className="flex justify-between text-[10px] text-[#adb5bd]">
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

      {/* ── 시뮬레이션 영역 (예시) ── */}
      <div className="rise-in mb-3">
        <SimulationNotice />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]">
        {/* 사이클 차트 */}
        <div className="rise-in-1 card flex flex-col gap-4 rounded-[20px] p-6">
          <div className="flex items-baseline justify-between">
            <div className="text-base font-extrabold text-ink">관양동 시세 사이클</div>
            <div className="flex gap-1.5 text-xs">
              <span className="chip chip-soft px-3 py-[5px]">3년</span>
              <span className="px-3 py-[5px] text-text-3">10년</span>
            </div>
          </div>
          <div className="relative h-[220px] border-b border-line">
            <div className="absolute inset-x-0 top-[30%] border-t border-dashed border-[#eef1f6]" />
            <div className="absolute inset-x-0 top-[60%] border-t border-dashed border-[#eef1f6]" />
            {SEGMENTS.map((s, i) => (
              <div
                key={i}
                className="absolute h-[3px] rounded-[2px]"
                style={{
                  left: s.left,
                  bottom: s.bottom,
                  width: s.width,
                  background: s.color,
                  transform: s.rotate ? `rotate(${s.rotate}deg)` : undefined,
                  transformOrigin: "left",
                }}
              />
            ))}
            <div className="absolute bottom-[40%] left-[86%] h-3.5 w-3.5 rounded-full border-[3px] border-white bg-primary shadow-[0_4px_12px_rgba(29,79,216,.4)]" />
            <div className="absolute left-[64%] top-[6%] rounded-lg bg-[rgba(25,31,40,.92)] px-2.5 py-1.5 text-[11px] font-bold text-white">
              현재: 하락 후반 → 바닥 다지기 구간
            </div>
          </div>
          <div className="flex justify-between text-[11px] text-[#adb5bd]">
            <span>2023</span>
            <span>2024</span>
            <span>2025</span>
            <span>2026</span>
          </div>
          <Link
            href="/analysis/cycle"
            className="self-start text-xs font-bold text-primary no-underline"
          >
            공작아파트 84㎡ 사이클 전망 상세 ›
          </Link>
        </div>

        {/* 우측 */}
        <div className="flex flex-col gap-4">
          <div className="rise-in-2 ai-panel flex flex-col gap-3 rounded-[20px] p-[22px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
            <div className="flex items-center gap-2">
              <span className="ai-chip h-[22px] w-[22px] rounded-[7px] text-[11px]">AI</span>
              <span className="text-sm font-extrabold text-white">타이밍 신호</span>
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
                62
              </div>
              <div className="text-xs leading-[1.6] text-ai-text">
                매수 신호 62/100 — 거래량 회복 초기 + 하락 폭 둔화.{" "}
                <b className="text-white">급할 필요는 없지만 후보를 좁힐 시기</b>입니다.
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {SIGNALS.map((s) => (
                <div
                  key={s.label}
                  className="flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs"
                >
                  <span className="text-ai-muted">{s.label}</span>
                  <span className={`font-bold ${s.accent ? "text-ai-accent" : "text-ai-text"}`}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[9px] leading-[1.5] text-ai-muted">
                본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
              </div>
          </div>

          <div className="rise-in-3 card flex flex-col gap-2 rounded-[20px] p-5">
            <div className="text-sm font-extrabold text-ink">알림 설정</div>
            {/* 장식용 가짜 토글 제거 — 실제 알림 설정으로 연결 */}
            {ALERTS.map((a) => (
              <div key={a} className="text-[13px] text-text-1">
                · {a}
              </div>
            ))}
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
