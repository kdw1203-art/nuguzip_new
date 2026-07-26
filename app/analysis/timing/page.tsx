import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
import {
  TEMPERATURE_REGIONS,
  computeRegionTemperature,
  currentYyyymm,
} from "@/lib/market/temperature";
import { TimingRegionSelect } from "./region-select";
import { TimingComplexPicker } from "./complex-picker";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const dynamic = "force-dynamic";

/* N7 — ?region=·?complexId=·?apt= 조합마다 별개 URL 로 색인되지 않도록 canonical 을
   파라미터 없는 경로로 고정한다. 지역을 바꿔도 페이지의 성격은 하나이고, 지역별
   랜딩은 /region/[id] 가 따로 맡는다. (그 전까지 이 페이지에는 metadata 자체가
   없어서 title·description 도 루트 기본값으로 나가고 있었다.) */
export const metadata = buildPageMetadata({
  title: "시세·타이밍 분석 — 시장 온도와 거래량 추세",
  description:
    "지역 매매가격지수 추세·모멘텀, 월별 실거래 거래량, 시장 온도를 함께 봅니다. 모든 수치는 실측 자료로만 그리고, 없는 구간은 없다고 표시합니다.",
  path: "/analysis/timing",
});

/* ============================================================
   시세·타이밍 분석 — 전 구간 실데이터.
   - 상단: 지역 선택 → 실제 매매가격지수 시리즈(getRegionSeries) 기반
     추세·모멘텀 규칙 판정
   - 하단 좌: 월별 매매 거래량(market_region_monthly 실측)
   - 하단 우: 시장 온도 = 지수 모멘텀 + 거래량 추이 합성 (규칙 기반)
   예전의 하드코딩 사이클 그림·"매수 신호 62/100"은 제거했다 — 구체적인
   숫자는 실측처럼 읽히므로, 실측이 아니면 그리지 않는다.
   ============================================================ */

/* 지역 목록·추세 판정·시장 온도 계산은 모두 lib/market/temperature.ts 로 옮겼다.
   N11(주간 아카이브)이 같은 점수를 매주 저장해야 하는데, 저장하는 쪽이 계산을
   다시 구현하면 두 숫자가 언젠가 갈라진다. 그 순간 아카이브는 "과거의 시장
   온도"가 아니라 "과거에 다른 공식으로 계산한 무언가"가 된다. 계산은 한 곳에만
   둔다 — 이 화면도 스냅샷 작성기도 computeRegionTemperature() 만 부른다. */
const REGION_OPTIONS = TEMPERATURE_REGIONS;

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
  const { trend, volume, temp } = await computeRegionTemperature(selected);
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
                이용자에게 있습니다.{" "}
                <Link href="/methodology#temperature" className="font-bold text-ai-accent no-underline">
                  계산 공식 보기 ›
                </Link>{" "}
                <Link
                  href={`/analysis/temperature/${selected.id}`}
                  className="font-bold text-ai-accent no-underline"
                >
                  주간 기록 보기 ›
                </Link>
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
