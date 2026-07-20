"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../../components/PageShell";
import { SimulationNotice } from "../../components/ExampleBadge";
import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
} from "@/lib/map/seoul-districts";

/* ============================================================
   시장·대출 시나리오 — 기준 시세를 지역 실데이터(스냅샷 평균가)로 프리필.
   지역 미선택/데이터 미보유 시 기존 예시 수치로 동작 (graceful).
   계산은 전부 클라이언트 (30년 원리금균등 상환 기준).
   ============================================================ */

const REGION_OPTIONS = [
  ...SEOUL_DISTRICTS.map((d) => ({ id: d.id, label: `서울 ${d.name}` })),
  ...METRO_EXPLORE_DISTRICTS.map((d) => ({
    id: d.id,
    label: `${d.city ?? "서울"} ${d.name}`,
  })),
];

const BASE_RATE = 4.19;
const RATE_CHIPS: { label: string; offset: number }[] = [
  { label: `기준 ${BASE_RATE}%`, offset: 0 },
  { label: "-1.0%p", offset: -1 },
  { label: "-0.5%p", offset: -0.5 },
  { label: "+0.5%p", offset: 0.5 },
  { label: "+1.0%p", offset: 1 },
  { label: "+2.0%p", offset: 2 },
];
const PRICE_CHIPS: { label: string; pct: number }[] = [
  { label: "▲ +10% 급등", pct: 10 },
  { label: "▲ +5%", pct: 5 },
  { label: "보합", pct: 0 },
  { label: "▼ -5%", pct: -5 },
  { label: "▼ -10%", pct: -10 },
  { label: "▼ -20% 급락", pct: -20 },
];
const PERIOD_CHIPS = ["3년", "5년", "10년"];

/** 예시 기본값: 공작아파트 84㎡ · 8.4억 */
const EXAMPLE_PRICE_WON = 840_000_000;
const LTV = 0.4;
const INCOME_WON = 70_000_000; // 연 소득 7,000만
const LOAN_MONTHS = 360; // 30년 원리금균등

type Baseline = {
  regionName: string;
  period: string;
  source: string;
  avgSaleWon: number;
  avgSaleLabel: string;
  jeonseRatio: number | null;
};

function monthlyPayment(principalWon: number, annualRatePct: number): number {
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return principalWon / LOAN_MONTHS;
  const pow = Math.pow(1 + r, LOAN_MONTHS);
  return (principalWon * r * pow) / (pow - 1);
}

function manwon(won: number): string {
  return `${Math.round(won / 10_000).toLocaleString("ko-KR")}만`;
}

function eok(won: number): string {
  const e = won / 100_000_000;
  const s = e >= 10 ? e.toFixed(1) : e.toFixed(2);
  return `${s.replace(/\.?0+$/, "")}억`;
}

function Chip({
  label,
  active,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[10px] px-3 py-2 text-xs ${
        active
          ? "border-[1.5px] border-primary bg-[rgba(29,79,216,.1)] font-bold text-primary"
          : "border border-[#e2e7ee] bg-surface text-text-2"
      } ${className}`}
    >
      {label}
    </button>
  );
}

export default function ScenarioPage() {
  const [rateOffset, setRateOffset] = useState(0);
  const [pricePct, setPricePct] = useState(0);
  const [period, setPeriod] = useState("5년");
  const [regionId, setRegionId] = useState("");
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [loadingBaseline, setLoadingBaseline] = useState(false);

  useEffect(() => {
    if (!regionId) {
      setBaseline(null);
      return;
    }
    let cancelled = false;
    setLoadingBaseline(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/ai/market-baseline?regionId=${encodeURIComponent(regionId)}`,
        );
        const data = (await res.json().catch(() => null)) as
          | ({ available?: boolean } & Baseline)
          | null;
        if (cancelled) return;
        setBaseline(
          data?.available && data.avgSaleWon > 0
            ? {
                regionName: data.regionName,
                period: data.period,
                source: data.source,
                avgSaleWon: data.avgSaleWon,
                avgSaleLabel: data.avgSaleLabel,
                jeonseRatio: data.jeonseRatio ?? null,
              }
            : null,
        );
      } catch {
        if (!cancelled) setBaseline(null);
      } finally {
        if (!cancelled) setLoadingBaseline(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [regionId]);

  const isReal = baseline !== null;
  const priceWon = baseline?.avgSaleWon ?? EXAMPLE_PRICE_WON;
  const loanWon = priceWon * LTV;
  const cashWon = priceWon - loanWon;

  const calc = useMemo(() => {
    const rate = BASE_RATE + rateOffset;
    const pay = monthlyPayment(loanWon, rate);
    const payStress = monthlyPayment(loanWon, rate + 1);
    const dsr = (pay * 12) / INCOME_WON;
    const dsrStress = (payStress * 12) / INCOME_WON;
    const priceDeltaWon = (priceWon * pricePct) / 100;
    const newPrice = priceWon + priceDeltaWon;
    const ltvAfter = newPrice > 0 ? (loanWon / newPrice) * 100 : 0;
    const bars = [
      { label: `기준 ${rate.toFixed(2)}%`, pay, color: "#1d4fd8" },
      { label: "+1.0%p", pay: payStress, color: "#d64545" },
      { label: "-0.5%p", pay: monthlyPayment(loanWon, Math.max(0.5, rate - 0.5)), color: "#7ea2ff" },
    ];
    const maxPay = Math.max(...bars.map((b) => b.pay));
    return { rate, pay, payStress, dsr, dsrStress, priceDeltaWon, ltvAfter, bars, maxPay };
  }, [loanWon, priceWon, rateOffset, pricePct]);

  const dsrTone = (v: number) =>
    v < 0.3
      ? { label: "적정", cls: "text-primary" }
      : v < 0.35
        ? { label: "주의", cls: "text-danger" }
        : { label: "위험", cls: "text-danger" };

  const aiComment = useMemo(() => {
    const stress = dsrTone(calc.dsrStress);
    const head = isReal
      ? `${baseline.regionName} 평균 매매가 ${baseline.avgSaleLabel}(${baseline.period} 기준) 실데이터로 계산했습니다.`
      : "예시 시세(8.4억) 기준 계산입니다. 지역을 선택하면 실제 평균가로 다시 계산해요.";
    const body =
      calc.dsrStress < 0.35
        ? `금리 1%p 상승 시에도 월 ${manwon(calc.payStress)}(소득 대비 ${(calc.dsrStress * 100).toFixed(0)}%)로 ${stress.label} 범위입니다.`
        : `금리 1%p 상승 시 월 ${manwon(calc.payStress)}(소득 대비 ${(calc.dsrStress * 100).toFixed(0)}%)로 부담이 커집니다. 대출 비율을 낮추거나 예산을 재조정하세요.`;
    const tail =
      pricePct < 0
        ? ` 시세 ${pricePct}% 시나리오에서 LTV는 ${calc.ltvAfter.toFixed(0)}%로 ${calc.ltvAfter < 60 ? "안전권" : "주의 구간"}입니다.`
        : "";
    return `${head} ${body}${tail}`;
  }, [baseline, calc, isReal, pricePct]);

  return (
    <PageShell breadcrumb="AI 분석 › 시장·대출 시나리오">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">시장·대출 시나리오</h1>
      </div>
      {!isReal && (
        <div className="rise-in mb-3">
          <SimulationNotice />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        {/* 조건 설정 */}
        <div className="rise-in-1 card flex flex-col gap-3.5 rounded-[20px] p-[22px]">
          <div className="text-[15px] font-extrabold text-ink">조건 설정</div>

          {/* 지역 실시세 프리필 */}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-text-2">기준 지역 (실시세)</span>
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              className="w-full rounded-[10px] border border-line bg-surface px-2.5 py-2 text-xs font-bold text-ink"
            >
              <option value="">예시 시세로 계산 (8.4억)</option>
              {REGION_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            {regionId && !loadingBaseline && !isReal && (
              <span className="text-[11px] text-text-3">
                이 지역은 아직 실시세 데이터가 없어 예시 시세로 계산해요.
              </span>
            )}
          </label>

          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-text-2">대상</span>
              <span className="text-right font-bold text-ink">
                {isReal
                  ? `${baseline.regionName} 평균 · ${baseline.avgSaleLabel}`
                  : "공작아파트 84㎡ · 8.4억"}
                {isReal && (
                  <span className="ml-1 rounded border border-line px-1 py-px text-[9px] font-semibold text-text-3 align-middle">
                    실데이터 기준
                  </span>
                )}
              </span>
            </div>
            {isReal && (
              <div className="flex justify-between text-[11px] text-text-3">
                <span>출처</span>
                <span>
                  {baseline.source.toUpperCase()} · {baseline.period} 기준
                  {baseline.jeonseRatio !== null
                    ? ` · 전세가율 ${baseline.jeonseRatio.toFixed(0)}%`
                    : ""}
                </span>
              </div>
            )}
            <div className="flex justify-between text-[13px]">
              <span className="text-text-2">대출 비율</span>
              <span className="font-extrabold text-ink">40%</span>
            </div>
            {/* 슬라이더 */}
            <div className="relative h-1.5 rounded-[3px] bg-[#eef1f6]">
              <div className="absolute left-0 top-0 h-1.5 w-[40%] rounded-[3px] bg-primary" />
              <div className="absolute left-[40%] top-[-5px] -ml-2 h-4 w-4 rounded-full border-2 border-primary bg-surface" />
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-text-2">연 소득</span>
              <span className="font-extrabold text-ink">7,000만원</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-text-2">필요 현금 (시세−대출)</span>
              <span className="font-extrabold text-ink">{eok(cashWon)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#f0f3f8] pt-3">
            <div className="text-[13px] font-extrabold text-ink">금리 시나리오</div>
            <div className="flex flex-wrap gap-1.5">
              {RATE_CHIPS.map((c) => (
                <Chip
                  key={c.label}
                  label={c.label}
                  active={rateOffset === c.offset}
                  onClick={() => setRateOffset(c.offset)}
                />
              ))}
            </div>
            <div className="mt-1 text-[13px] font-extrabold text-ink">시세 시나리오</div>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_CHIPS.map((c) => (
                <Chip
                  key={c.label}
                  label={c.label}
                  active={pricePct === c.pct}
                  onClick={() => setPricePct(c.pct)}
                />
              ))}
            </div>
            <div className="mt-1 text-[13px] font-extrabold text-ink">보유 기간</div>
            <div className="flex gap-1.5">
              {PERIOD_CHIPS.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={period === c}
                  onClick={() => setPeriod(c)}
                  className="flex-1 text-center"
                />
              ))}
            </div>
          </div>

          <div className="rounded-[14px] bg-bg p-3 text-center text-xs font-semibold text-text-3">
            {isReal
              ? "지역 평균 실시세 기준 · 30년 원리금균등 상환으로 자동 계산돼요"
              : "예시 시세 기준 · 지역을 선택하면 실제 평균가로 계산돼요"}
          </div>
        </div>

        {/* 결과 */}
        <div className="flex flex-col gap-4">
          <div className="rise-in-2 grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <div className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">
                월 원리금 ({calc.rate.toFixed(2)}%)
                {isReal && (
                  <span className="ml-1 rounded border border-line px-1 py-px text-[9px] font-semibold">
                    실데이터 기준
                  </span>
                )}
              </div>
              <div className="mt-1 text-[22px] font-extrabold text-ink">
                {manwon(calc.pay)}원
              </div>
              <div className={`mt-0.5 text-[11px] font-bold ${dsrTone(calc.dsr).cls}`}>
                소득 대비 {(calc.dsr * 100).toFixed(0)}% · {dsrTone(calc.dsr).label}
              </div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">금리 +1.0%p 시</div>
              <div className="mt-1 text-[22px] font-extrabold text-danger">
                {manwon(calc.payStress)}원
              </div>
              <div className={`mt-0.5 text-[11px] font-bold ${dsrTone(calc.dsrStress).cls}`}>
                소득 대비 {(calc.dsrStress * 100).toFixed(0)}% · {dsrTone(calc.dsrStress).label}
              </div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">
                시세 {pricePct === 0 ? "보합" : `${pricePct > 0 ? "+" : ""}${pricePct}%`} 시 자산
              </div>
              <div
                className={`mt-1 text-[22px] font-extrabold ${
                  calc.priceDeltaWon < 0 ? "text-ink" : "text-primary"
                }`}
              >
                {calc.priceDeltaWon === 0
                  ? "±0원"
                  : `${calc.priceDeltaWon > 0 ? "+" : "-"}${manwon(Math.abs(calc.priceDeltaWon))}`}
              </div>
              <div className="mt-0.5 text-[11px] text-text-3">
                LTV {calc.ltvAfter.toFixed(0)}%로 {pricePct < 0 ? "상승" : "변동"} ·{" "}
                {calc.ltvAfter < 60 ? "안전권" : "주의"}
              </div>
            </div>
          </div>

          <div className="rise-in-3 card flex flex-col gap-3 rounded-[20px] p-[22px]">
            <div className="text-[15px] font-extrabold text-ink">시나리오별 월 부담 비교</div>
            <div className="flex flex-col gap-2.5">
              {calc.bars.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="w-[90px] shrink-0 text-xs text-text-2">{b.label}</span>
                  <div className="relative h-[22px] flex-1 rounded-md bg-[#eef1f6]">
                    <div
                      className="absolute left-0 flex h-[22px] items-center justify-end rounded-md pr-2 text-[11px] font-bold text-white"
                      style={{
                        width: `${Math.max(18, Math.round((b.pay / calc.maxPay) * 92))}%`,
                        background: b.color,
                      }}
                    >
                      {manwon(b.pay)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rise-in-4 ai-panel flex flex-col gap-2 rounded-[20px] p-5 shadow-[0_14px_36px_rgba(16,28,54,.22)]">
            <div className="flex items-start gap-3">
              <span className="ai-chip h-[22px] w-[22px] shrink-0 rounded-[7px] text-[11px]">AI</span>
              <div className="flex-1 text-[13px] leading-[1.65] text-ai-text">{aiComment}</div>
              <span className="shrink-0 rounded border border-[rgba(255,255,255,.25)] px-1.5 py-px text-[9px] font-bold text-ai-muted">
                규칙 기반 요약
              </span>
            </div>
            <div className="text-[9px] leading-[1.5] text-ai-muted">
              본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
