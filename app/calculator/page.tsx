"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";

const MODES = ["실거주", "전세", "월세"] as const;
const RATE = 4.19; // 은행 평균 (%)
const INCOME = 7000; // 연 소득 (만원)

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

const SIM_CARDS = [
  { label: "실투자금", value: "5.66억", tone: "text-ink", sub: "현금 5.4억 + 취득세·부대 0.26억", soft: false },
  { label: "5년 총비용", value: "7,180만", tone: "text-danger", sub: "이자 4,480만 + 보유세·관리비", soft: false },
  { label: "기준 시나리오 (+8%)", value: "+5,140만", tone: "text-primary", sub: "연 환산 1.8% · 실거주 가치 별도", soft: true },
  { label: "손익분기 매도가", value: "8.62억", tone: "text-ink", sub: "양도세(비과세 가정)·중개비 포함", soft: false },
] as const;

function formatEok(manwon: number): string {
  const eok = Math.floor(manwon / 10000);
  const rest = Math.round(manwon % 10000);
  if (eok === 0) return `${rest.toLocaleString()}만원`;
  if (rest === 0) return `${eok}억원`;
  return `${eok}억 ${rest.toLocaleString()}만원`;
}

type LoanCalcResult = {
  monthlyPayment: number; // 만원
  totalInterest: number; // 만원
  totalRepayment: number; // 만원
};

export default function CalculatorPage() {
  const [mode, setMode] = useState<(typeof MODES)[number]>("실거주");
  const [price, setPrice] = useState(84000); // 만원
  const [loanRatio, setLoanRatio] = useState(40); // %
  const [years, setYears] = useState(30);
  const [serverCalc, setServerCalc] = useState<LoanCalcResult | null>(null);

  const loan = price * (loanRatio / 100);
  const r = RATE / 100 / 12;
  const n = years * 12;
  const clientMonthly = loan > 0 ? (loan * r) / (1 - Math.pow(1 + r, -n)) : 0; // 만원 (폴백)

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
            annualRate: RATE,
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
  }, [price, loanRatio, years]);

  const monthly = serverCalc ? serverCalc.monthlyPayment : clientMonthly;
  const cashNeeded = price - loan + price * 0.033; // 취득세·부대비용 포함
  const burden = Math.round(((monthly * 12) / INCOME) * 100);
  const burdenLabel = burden <= 30 ? "적정" : burden <= 40 ? "주의" : "위험";

  return (
    <PageShell breadcrumb="투자 도구 › 대출·수익률 계산기" title="대출·수익률 계산기" wide>
      <div className="rise-in -mt-2 mb-4 text-[11px] text-[#adb5bd]">
        입력 정보는 기기에만 저장 · 외부 전송 없음
      </div>

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
            <div className="text-sm font-extrabold text-ink">1. 내 정보</div>
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
              <span className="text-[13px] text-text-2">
                금리 <span className="text-[11px] text-text-3">(은행 평균)</span>
              </span>
              <span className="text-base font-extrabold text-primary">{RATE}%</span>
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
            href="/notes"
            className="rise-in-4 flex items-center justify-between rounded-[14px] bg-primary-soft px-4 py-[13px]"
          >
            <span className="text-[13px] font-bold text-primary">
              이 조건으로 공작아파트 노트에 저장
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
          <div className="rise-in-1 grid gap-3 md:grid-cols-3">
            <div className="ai-panel rounded-2xl p-[18px]">
              <div className="text-[11px] text-ai-muted">최대 대출 가능 금액</div>
              <div className="mt-1 text-[23px] font-extrabold text-[#7ea2ff]">5.53억</div>
              <div className="mt-[3px] text-[10px] text-ai-muted">
                생애최초 LTV 70% · DSR 40% 중 낮은 값
              </div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-[11px] text-text-3">권장 대출 (예비비 확보)</div>
              <div className="mt-1 text-[23px] font-extrabold text-ink">2.5억</div>
              <div className="mt-[3px] text-[10px] text-text-3">현금 5.5억 중 1,000만 예비비 유지</div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-[11px] text-text-3">예상 월 원리금 (2.5억 기준)</div>
              <div className="mt-1 text-[23px] font-extrabold text-primary">108만원</div>
              <div className="mt-[3px] text-[10px] text-primary">DSR 24% · 여유</div>
            </div>
          </div>

          <div className="rise-in-2 card flex flex-col gap-1 overflow-x-auto rounded-[18px] px-5 py-[18px]">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm font-extrabold text-ink">
                3. 은행별 금리 비교{" "}
                <span className="text-[11px] font-medium text-text-3">주담대 40년 · 07.19 기준</span>
              </span>
              <span className="text-[11px] font-bold text-primary">우대조건 입력 ›</span>
            </div>
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
                      row.best ? "text-primary" : "policy" in row && row.policy ? "text-[#c07a3a]" : "text-text-1"
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
          </div>

          <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] px-5 py-[18px]">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-extrabold text-ink">
                4. 수익률 시뮬레이션{" "}
                <span className="text-[11px] font-medium text-text-3">
                  7.9억 매수 · 대출 2.5억 · 5년 보유 가정
                </span>
              </span>
              <span className="text-[11px] font-bold text-primary">가정 수정 ›</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              {SIM_CARDS.map((c) => (
                <div
                  key={c.label}
                  className={`rounded-xl px-3.5 py-3 ${c.soft ? "bg-[rgba(29,79,216,.06)]" : "bg-bg"}`}
                >
                  <div className={`text-[10px] ${c.soft ? "text-[#5b74b8]" : "text-text-3"}`}>{c.label}</div>
                  <div className={`text-base font-extrabold ${c.tone}`}>{c.value}</div>
                  <div className={`text-[9px] ${c.soft ? "text-[#5b74b8]" : "text-text-3"}`}>{c.sub}</div>
                </div>
              ))}
            </div>
            <div className="mt-0.5 flex flex-col gap-1.5">
              {[
                { label: "적극 +24%", width: "82%", bg: "bg-danger opacity-85", text: "+1.62억 · 연 5.2%", tone: "text-danger" },
                { label: "기준 +8%", width: "46%", bg: "bg-primary", text: "+5,140만 · 연 1.8%", tone: "text-primary" },
                { label: "보수 -7%", width: "26%", bg: "bg-[#8b95a1]", text: "-1.27억", tone: "text-text-3" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2.5">
                  <span className={`w-24 text-[11px] font-bold ${s.tone}`}>{s.label}</span>
                  <div className="relative h-4 flex-1 rounded-[5px] bg-[#eef1f6]">
                    <div
                      className={`absolute left-0 flex h-4 items-center justify-end rounded-[5px] pr-2 text-[10px] font-bold text-white ${s.bg}`}
                      style={{ width: s.width }}
                    >
                      {s.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-between gap-1 border-t border-[#f0f3f8] pt-2 text-[11px] text-text-3 md:flex-row">
              <span>비교: 전세 유지 + 여유자금 예금(3.2%) 시 5년 +9,060만</span>
              <span className="font-bold text-primary">월세 vs 매수 상세 비교 ›</span>
            </div>
          </div>

          <div className="rise-in-4">
            <AIPanel title="AI 판단 보조">
              생애최초 요건으로 <b className="text-[#7ea2ff]">보금자리론 고정 3.80%</b>가 최적입니다.
              취득세 감면(-200만) 포함 시 손익분기 매도가는 8.60억으로 내려갑니다. 기준 시나리오의 금전
              수익률(연 1.8%)은 예금보다 낮지만,{" "}
              <b className="text-white">월세 대체 효과(연 2,400만)를 더하면 실질 연 6% 수준</b>입니다.
            </AIPanel>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
