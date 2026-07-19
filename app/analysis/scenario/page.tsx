"use client";

import { useState } from "react";
import { PageShell } from "../../components/PageShell";

const RATE_CHIPS = ["기준 4.19%", "-1.0%p", "-0.5%p", "+0.5%p", "+1.0%p", "+2.0%p"];
const PRICE_CHIPS = ["▲ +10% 급등", "▲ +5%", "보합", "▼ -5%", "▼ -10%", "▼ -20% 급락"];
const PERIOD_CHIPS = ["3년", "5년", "10년"];

const BARS = [
  { label: "기준 4.19%", width: "56%", color: "#1d4fd8", value: "164만" },
  { label: "+1.0%p", width: "64%", color: "#d64545", value: "185만" },
  { label: "-0.5%p", width: "52%", color: "#7ea2ff", value: "153만" },
] as const;

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
  const [rate, setRate] = useState("기준 4.19%");
  const [price, setPrice] = useState("보합");
  const [period, setPeriod] = useState("5년");

  return (
    <PageShell breadcrumb="AI 분석 › 시장·대출 시나리오">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">시장·대출 시나리오</h1>
        <button className="btn-soft rounded-[10px] px-3.5 py-2 text-[13px]">시나리오 저장</button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        {/* 조건 설정 */}
        <div className="rise-in-1 card flex flex-col gap-3.5 rounded-[20px] p-[22px]">
          <div className="text-[15px] font-extrabold text-ink">조건 설정</div>
          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-text-2">대상</span>
              <span className="font-bold text-ink">공작아파트 84㎡ · 8.4억</span>
            </div>
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
              <span className="text-text-2">보유 현금</span>
              <span className="font-extrabold text-ink">5.5억</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#f0f3f8] pt-3">
            <div className="text-[13px] font-extrabold text-ink">금리 시나리오</div>
            <div className="flex flex-wrap gap-1.5">
              {RATE_CHIPS.map((c) => (
                <Chip key={c} label={c} active={rate === c} onClick={() => setRate(c)} />
              ))}
              <span className="rounded-[10px] bg-[#f2f4f8] px-3 py-2 text-xs text-text-3">
                ✎ 직접 입력
              </span>
            </div>
            <div className="mt-1 text-[13px] font-extrabold text-ink">시세 시나리오</div>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_CHIPS.map((c) => (
                <Chip key={c} label={c} active={price === c} onClick={() => setPrice(c)} />
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

          <button className="btn-primary btn-cta rounded-[14px] p-[13px] text-sm shadow-[0_8px_20px_rgba(29,79,216,.35)]">
            시나리오 실행
          </button>
        </div>

        {/* 결과 */}
        <div className="flex flex-col gap-4">
          <div className="rise-in-2 grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <div className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">월 원리금 (기준)</div>
              <div className="mt-1 text-[22px] font-extrabold text-ink">164만원</div>
              <div className="mt-0.5 text-[11px] font-bold text-primary">소득 대비 28% · 적정</div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">금리 +1.0%p 시</div>
              <div className="mt-1 text-[22px] font-extrabold text-danger">185만원</div>
              <div className="mt-0.5 text-[11px] font-bold text-danger">소득 대비 32% · 주의</div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">시세 -10% 시 자산</div>
              <div className="mt-1 text-[22px] font-extrabold text-ink">-8,400만</div>
              <div className="mt-0.5 text-[11px] text-text-3">LTV 44%로 상승 · 안전권</div>
            </div>
          </div>

          <div className="rise-in-3 card flex flex-col gap-3 rounded-[20px] p-[22px]">
            <div className="text-[15px] font-extrabold text-ink">시나리오별 월 부담 비교</div>
            <div className="flex flex-col gap-2.5">
              {BARS.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="w-[90px] shrink-0 text-xs text-text-2">{b.label}</span>
                  <div className="relative h-[22px] flex-1 rounded-md bg-[#eef1f6]">
                    <div
                      className="absolute left-0 flex h-[22px] items-center justify-end rounded-md pr-2 text-[11px] font-bold text-white"
                      style={{ width: b.width, background: b.color }}
                    >
                      {b.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rise-in-4 ai-panel flex items-start gap-3 rounded-[20px] p-5 shadow-[0_14px_36px_rgba(16,28,54,.22)]">
            <span className="ai-chip h-[22px] w-[22px] rounded-[7px] text-[11px]">AI</span>
            <div className="text-[13px] leading-[1.65] text-ai-text">
              금리 1%p 상승까지는 소득 대비 부담이 32%로 감내 범위입니다. 다만 보유 현금 5.5억 중
              5.3억이 묶이므로, <b className="text-white">예비비 6개월치(약 1,000만)를 남기는 41% 대출안</b>
              을 권장합니다.
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
