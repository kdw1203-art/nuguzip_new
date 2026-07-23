"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { ExampleBadge } from "@/app/components/ExampleBadge";
import { Icon } from "@/app/components/Icon";
import { RealEstateTools } from "./realestate-tools";

/* B10: 상단 섹션 탭 — 기존 대출·수익률 계산기 + 신규 부동산 계산기 */
const SECTIONS = [
  { key: "loan", label: "대출·수익률", icon: "calculator" },
  { key: "realestate", label: "부동산 계산기", icon: "repeat" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

const MODES = ["실거주", "전세", "월세"] as const;
const FALLBACK_RATE = 4.19; // 은행 평균 (%) — 실데이터 미연동 시 예시값
const INCOME = 7000; // 연 소득 (만원)

/* P2-4: 서버에서 주입되는 주담대 공시 금리 (lib/finance/mortgage-rates 결과와 동일 형태) */
export interface MortgageRateItem {
  bank: string;
  /** "3.62~5.13%" 형식 (없으면 "-") */
  variable: string;
  fixed: string;
  note: string;
}
export interface MortgageRatesProp {
  live: boolean;
  source: string;
  asOf: string | null;
  rates: MortgageRateItem[];
}

const BANK_ROWS = [
  {
    bank: "K은행 · 최저",
    base: "4.31%",
    applied: "3.89%",
    monthly: "104만",
    cond: "생애최초 -0.3 · 급여이체 -0.1",
    best: true,
  },
  { bank: "S은행", base: "4.25%", applied: "3.98%", monthly: "106만", cond: "카드 실적 -0.2", best: false },
  { bank: "H은행", base: "4.42%", applied: "4.05%", monthly: "107만", cond: "비대면 신청 -0.15", best: false },
  {
    bank: "보금자리론 (정책)",
    base: "고정 4.10%",
    applied: "3.80%",
    monthly: "103만",
    cond: "주택가 9억 이하 · 소득요건 충족",
    best: false,
    policy: true,
  },
] as const;

function formatEok(manwon: number): string {
  const eok = Math.floor(manwon / 10000);
  const rest = Math.round(manwon % 10000);
  if (eok === 0) return `${rest.toLocaleString()}만원`;
  if (rest === 0) return `${eok}억원`;
  return `${eok}억 ${rest.toLocaleString()}만원`;
}

/** "3.62~5.13%" → { min: 3.62, max: 5.13 } · 파싱 불가 시 null */
function parseRateRange(s: string): { min: number; max: number } | null {
  const nums = s.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite);
  if (!nums || nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** 공시 금리표에서 대표 금리(은행별 변동금리 중간값 평균, 없으면 고정) 도출 — 실패 시 null */
function deriveAverageRate(rates: MortgageRateItem[]): number | null {
  const mids: number[] = [];
  for (const r of rates) {
    const range = parseRateRange(r.variable) ?? parseRateRange(r.fixed);
    if (range) mids.push((range.min + range.max) / 2);
  }
  if (mids.length === 0) return null;
  const avg = mids.reduce((a, b) => a + b, 0) / mids.length;
  return Math.round(avg * 100) / 100;
}

/** 원리금균등 월 상환액 (만원) */
function monthlyPaymentOf(loanManwon: number, annualRatePct: number, years: number): number {
  if (loanManwon <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return loanManwon / n;
  return (loanManwon * r) / (1 - Math.pow(1 + r, -n));
}

type LoanCalcResult = {
  monthlyPayment: number; // 만원
  totalInterest: number; // 만원
  totalRepayment: number; // 만원
};

export function CalculatorClient({ mortgage }: { mortgage: MortgageRatesProp }) {
  const [section, setSection] = useState<Section>("loan");
  const [mode, setMode] = useState<(typeof MODES)[number]>("실거주");
  const [price, setPrice] = useState(84000); // 만원
  const [loanRatio, setLoanRatio] = useState(40); // %
  const [years, setYears] = useState(30);
  const [serverCalc, setServerCalc] = useState<LoanCalcResult | null>(null);

  // P2-4: 공시 실데이터가 있으면 은행별 변동금리 중간값 평균, 없으면 예시 상수
  const liveRate = mortgage.live ? deriveAverageRate(mortgage.rates) : null;
  const rate = liveRate ?? FALLBACK_RATE;
  const rateIsLive = liveRate !== null;

  const loan = price * (loanRatio / 100);
  const clientMonthly = monthlyPaymentOf(loan, rate, years); // 만원 (폴백)

  // 구 API /api/loan/calc 서버 계산 연결 — 실패 시 클라이언트 계산 폴백 유지
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/loan/calc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            price, // 만원 단위 그대로 전달 (응답도 만원 단위)
            down: price - price * (loanRatio / 100),
            ltv: 70,
            annualRate: rate,
            years,
            method: "annuity",
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("loan calc failed");
        const data = (await res.json()) as Partial<LoanCalcResult>;
        if (typeof data.monthlyPayment === "number") {
          setServerCalc({
            monthlyPayment: data.monthlyPayment,
            totalInterest: data.totalInterest ?? 0,
            totalRepayment: data.totalRepayment ?? 0,
          });
        }
      } catch {
        if (!controller.signal.aborted) setServerCalc(null); // 폴백: 클라이언트 계산
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [price, loanRatio, years, rate]);

  const monthly = serverCalc ? serverCalc.monthlyPayment : clientMonthly;
  const cashNeeded = price - loan + price * 0.033; // 취득세·부대비용 포함
  const burden = Math.round(((monthly * 12) / INCOME) * 100);
  const burdenLabel = burden <= 30 ? "적정" : burden <= 40 ? "주의" : "위험";

  return (
    <PageShell breadcrumb="투자 도구 › 대출·수익률 계산기" title="대출·수익률 계산기" wide>
      <div className="rise-in -mt-2 mb-4 text-[11px] text-[#adb5bd]">
        입력 정보는 기기에만 저장 · 외부 전송 없음
      </div>

      <div className="rise-in mb-4 flex gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] ${
              section === s.key
                ? "bg-ink font-bold text-white"
                : "border border-[#e2e7ee] bg-surface font-semibold text-text-2"
            }`}
          >
            <Icon name={s.icon} size={15} />
            {s.label}
          </button>
        ))}
      </div>

      {section === "realestate" && <RealEstateTools />}

      {section === "loan" && (
      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        {/* ---------- 입력 (9j 좌측 + 6h 슬라이더) ---------- */}
        <div className="flex flex-col gap-3">
          <div className="rise-in flex gap-2">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-full p-[9px] text-center text-[13px] ${
                  mode === m
                    ? "bg-ink font-bold text-white"
                    : "border border-[#e2e7ee] bg-surface font-semibold text-text-2"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-extrabold text-ink">1. 내 정보</span>
              <ExampleBadge />
            </div>
            <div className="-mt-1 text-[11px] text-text-3">
              아래 소득·현금은 예시 가정값이에요. 부담률 계산의 기준으로만 쓰여요.
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-2">연 소득 (세전)</span>
              <span className="rounded-lg bg-bg px-3 py-[7px] font-extrabold text-ink">7,000만원</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-2">보유 현금 (예적금·주식)</span>
              <span className="rounded-lg bg-bg px-3 py-[7px] font-extrabold text-ink">5.5억</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-2">기존 대출 월 상환액</span>
              <span className="rounded-lg bg-bg px-3 py-[7px] font-extrabold text-ink">35만원</span>
            </div>
            <div className="flex items-center gap-2 border-t border-[#f0f3f8] pt-2">
              <span className="w-11 text-xs text-text-2">구분</span>
              <div className="flex flex-wrap gap-1.5">
                {["생애최초", "무주택", "1주택 처분조건", "다주택"].map((c, i) => (
                  <span
                    key={c}
                    className={`rounded-full px-3 py-1.5 text-xs ${
                      i === 0
                        ? "border-[1.5px] border-primary bg-primary-soft font-bold text-primary"
                        : "border border-[#e2e7ee] bg-surface text-text-2"
                    }`}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rise-in-2 card flex flex-col gap-3 rounded-[18px] p-[18px]">
            <div className="text-sm font-extrabold text-ink">2. 대상 매물 · 조건</div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-2">매매가</span>
              <span className="text-base font-extrabold text-ink">{formatEok(price)}</span>
            </div>
            <input
              type="range"
              min={30000}
              max={200000}
              step={1000}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full accent-[#1d4fd8]"
              aria-label="매매가"
            />
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-2">대출 비율</span>
              <span className="text-base font-extrabold text-ink">{loanRatio}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={70}
              step={1}
              value={loanRatio}
              onChange={(e) => setLoanRatio(Number(e.target.value))}
              className="w-full accent-[#1d4fd8]"
              aria-label="대출 비율"
            />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13px] text-text-2">
                금리{" "}
                <span className="text-[11px] text-text-3">
                  {rateIsLive ? "(공시 평균)" : "(은행 평균)"}
                </span>
                {!rateIsLive && <ExampleBadge />}
              </span>
              <span className="text-base font-extrabold text-primary">{rate}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-2">상환 기간</span>
              <div className="flex gap-1">
                {[10, 20, 30, 40].map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYears(y)}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      years === y
                        ? "bg-ink font-bold text-white"
                        : "border border-[#e2e7ee] bg-surface text-text-2"
                    }`}
                  >
                    {y}년
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 계산 결과 (6h 다크 패널) */}
          <div className="rise-in-3 ai-panel flex flex-col gap-2.5 rounded-[20px] p-[18px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-ai-muted">
                월 원리금{" "}
                <span className="text-[10px]">
                  {serverCalc ? "· 서버 계산" : "· 간이 계산"}
                </span>
              </span>
              <span className="text-2xl font-extrabold text-white">{Math.round(monthly)}만원</span>
            </div>
            {serverCalc && (
              <div className="flex justify-between text-xs text-ai-muted">
                <span>총 이자 ({years}년)</span>
                <span className="font-bold text-ai-text">{formatEok(serverCalc.totalInterest)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-ai-muted">
              <span>필요 현금 (취득세 포함)</span>
              <span className="font-bold text-ai-text">{formatEok(Math.round(cashNeeded))}</span>
            </div>
            <div className="flex justify-between text-xs text-ai-muted">
              <span>소득 대비 부담 (연 7,000만)</span>
              <span className="font-bold text-[#7ea2ff]">
                {burden}% · {burdenLabel}
              </span>
            </div>
          </div>

          <Link
            href="/notes/new"
            className="rise-in-4 flex items-center justify-between rounded-[14px] bg-primary-soft px-4 py-[13px]"
          >
            <span className="text-[13px] font-bold text-primary">
              이 조건으로 임장노트에 저장
            </span>
            <span className="text-sm font-extrabold text-primary">›</span>
          </Link>

          {/* 계산기→시나리오 연결 (15h) */}
          <Link
            href="/analysis/scenario"
            className="rise-in-5 block text-center text-[13px] font-bold text-primary"
          >
            이 조건으로 시장·대출 시나리오 보기 ›
          </Link>
        </div>

        {/* ---------- 결과 상세 (9j 우측) ---------- */}
        <div className="flex flex-col gap-3">
          {/* 사실 우선: 슬라이더 입력과 무관하게 고정돼 있던 결과를 실제 입력 기반 계산으로 교체 */}
          <div className="rise-in-1 grid gap-3 md:grid-cols-3">
            <div className="ai-panel rounded-2xl p-[18px]">
              <div className="text-[11px] text-ai-muted">최대 대출 (LTV 70%)</div>
              <div className="mt-1 text-[23px] font-extrabold text-[#7ea2ff]">
                {formatEok(Math.round(price * 0.7))}
              </div>
              <div className="mt-[3px] text-[10px] text-ai-muted">
                매매가 {formatEok(price)}의 70% · DSR·소득요건은 은행 심사 별도
              </div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-[11px] text-text-3">선택한 대출액</div>
              <div className="mt-1 text-[23px] font-extrabold text-ink">
                {formatEok(Math.round(loan))}
              </div>
              <div className="mt-[3px] text-[10px] text-text-3">대출 비율 {loanRatio}%</div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-[11px] text-text-3">월 원리금 (선택 조건)</div>
              <div className="mt-1 text-[23px] font-extrabold text-primary">
                {Math.round(monthly)}만원
              </div>
              <div className="mt-[3px] text-[10px] text-primary">
                금리 {rate}% · {years}년 원리금균등
              </div>
            </div>
          </div>

          {/* P2-4: 은행별 금리 — 공시 실데이터(변동/고정 min~max) 또는 예시 표 */}
          <div className="rise-in-2 card flex flex-col gap-1 overflow-x-auto rounded-[18px] px-5 py-[18px]">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                3. 은행별 금리 비교{" "}
                <span className="text-[11px] font-medium text-text-3">
                  {mortgage.live
                    ? `주담대 공시 금리${mortgage.asOf ? ` · ${mortgage.asOf} 기준` : ""}`
                    : "주담대 40년"}
                </span>
                {!mortgage.live && <ExampleBadge />}
              </span>
              <span className="text-[11px] font-bold text-primary">우대조건 입력 ›</span>
            </div>
            {mortgage.live ? (
              <div className="min-w-[540px]">
                <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-2 border-b border-[#f0f3f8] py-2 text-[11px] text-text-3">
                  <span>은행</span>
                  <span className="text-center">변동금리</span>
                  <span className="text-center">고정금리</span>
                  <span className="text-center">월 원리금 (최저 변동)</span>
                </div>
                {mortgage.rates.map((row, i) => {
                  const minVar =
                    parseRateRange(row.variable)?.min ?? parseRateRange(row.fixed)?.min ?? null;
                  const best = i === 0;
                  return (
                    <div
                      key={row.bank}
                      className={`grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs last:border-b-0 ${
                        best ? "rounded-lg bg-[rgba(29,79,216,.04)]" : ""
                      }`}
                    >
                      <span className={`pl-1.5 font-bold ${best ? "text-primary" : "text-text-1"}`}>
                        {row.bank}
                        {best ? " · 최저" : ""}
                      </span>
                      <span
                        className={`text-center font-extrabold ${best ? "text-primary" : "text-text-1"}`}
                      >
                        {row.variable}
                      </span>
                      <span className="text-center font-bold text-text-1">{row.fixed}</span>
                      <span className="text-center font-extrabold text-ink">
                        {minVar !== null && loan > 0
                          ? `${Math.round(monthlyPaymentOf(loan, minVar, years))}만`
                          : "—"}
                      </span>
                    </div>
                  );
                })}
                <div className="mt-2 text-[11px] text-[#adb5bd]">
                  금리 출처: {mortgage.source}
                  {mortgage.asOf ? ` · 공시 기준월 ${mortgage.asOf}` : ""} · 월 원리금은 현재 입력한
                  대출액({formatEok(Math.round(loan))})·{years}년 원리금균등 기준 참고 계산이며 실제
                  조건은 은행 심사에 따라 달라집니다
                </div>
              </div>
            ) : (
              <div className="min-w-[540px]">
                <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1.2fr] gap-2 border-b border-[#f0f3f8] py-2 text-[11px] text-text-3">
                  <span>은행</span>
                  <span className="text-center">기본 금리</span>
                  <span className="text-center">우대 적용</span>
                  <span className="text-center">월 원리금</span>
                  <span className="text-center">우대 조건</span>
                </div>
                {BANK_ROWS.map((row) => (
                  <div
                    key={row.bank}
                    className={`grid grid-cols-[1.2fr_1fr_1fr_1fr_1.2fr] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs last:border-b-0 ${
                      row.best ? "rounded-lg bg-[rgba(29,79,216,.04)]" : ""
                    }`}
                  >
                    <span className={`pl-1.5 font-bold ${row.best ? "text-primary" : "text-text-1"}`}>
                      {row.bank}
                    </span>
                    <span className="text-center font-bold text-text-1">{row.base}</span>
                    <span
                      className={`text-center font-extrabold ${
                        row.best
                          ? "text-primary"
                          : "policy" in row && row.policy
                            ? "text-[#c07a3a]"
                            : "text-text-1"
                      }`}
                    >
                      {row.applied}
                    </span>
                    <span className="text-center font-extrabold text-ink">{row.monthly}</span>
                    <span className="text-center text-[10px] text-text-2">{row.cond}</span>
                  </div>
                ))}
                <div className="mt-2 text-[11px] text-[#adb5bd]">
                  금리는 참고용 예시이며 실제 조건은 은행 심사에 따라 달라집니다 · 정책
                  대출(보금자리론·디딤돌) 자격이 우선 검토됩니다
                </div>
              </div>
            )}
          </div>

          {/* 사실 우선: 임의 가정(+8% 상승·손익분기·연 수익률 등) 기반 수익률 시뮬레이션과
              특정 수치를 단정하던 AI 판단 보조를 제거. 시세 상승 전망은 사실이 아니므로 표시하지 않음. */}
          <div className="rise-in-3 card flex flex-col gap-1.5 rounded-[18px] px-5 py-[18px]">
            <div className="text-sm font-extrabold text-ink">참고 안내</div>
            <p className="text-[12px] leading-relaxed text-text-2">
              위 금액은 입력한 매매가·대출 비율·금리·기간에 따른 원리금균등 계산 결과예요. 실제
              대출 한도와 금리는 소득·DSR·주택 수 등 은행 심사에 따라 달라지고, 정책대출(보금자리론·디딤돌)
              자격이 우선 검토됩니다. 향후 시세 상승·수익률은 확정된 사실이 아니므로 표시하지 않아요.
            </p>
          </div>
        </div>
      </div>
      )}
    </PageShell>
  );
}
