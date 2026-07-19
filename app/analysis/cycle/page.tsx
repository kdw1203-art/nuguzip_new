"use client";

import { useState } from "react";
import { PageShell } from "../../components/PageShell";

type PeriodKey = "1년" | "3년" | "5년" | "10년";

type PeriodData = {
  delta: string;
  fan: string;
  aggressive: string;
  base: string;
  conservative: string;
  targets: { text: string; bottom: string; tone: "red" | "blue" | "gray" }[];
  axis: string[];
  expectLabel: string;
  expectValue: string;
};

/* 시안 9c의 3년 팬차트 path를 기준으로, 기간별 전망 경로만 변형 */
const HIST_LINE =
  "M0,95 C80,102 150,135 220,160 C280,181 340,181 400,172 C460,163 505,157 550,152";
const HIST_AREA =
  "M0,95 C80,102 150,135 220,160 C280,181 340,181 400,172 C460,163 505,157 550,152 L550,250 L0,250 Z";

const PERIODS: Record<PeriodKey, PeriodData> = {
  "1년": {
    delta: "▼ 3.1% (1년 고점 대비)",
    fan: "M550,152 C670,146 790,128 910,110 L910,165 C790,161 670,156 550,152 Z",
    aggressive: "M550,152 C670,146 790,128 910,110",
    base: "M550,152 C670,150 790,142 910,135",
    conservative: "M550,152 C670,156 790,161 910,165",
    targets: [
      { text: "8.9억 +6%", bottom: "52%", tone: "red" },
      { text: "8.6억 +2%", bottom: "42%", tone: "blue" },
      { text: "8.1억 -4%", bottom: "31%", tone: "gray" },
    ],
    axis: ["2024 H2", "2025 H1", "2025 H2", "오늘", "+3개월", "+6개월", "+1년"],
    expectLabel: "1년 기대값 (가중)",
    expectValue: "8.6억 (+2.4%)",
  },
  "3년": {
    delta: "▼ 12.5% (3년 고점 대비)",
    fan: "M550,152 C650,138 780,94 910,60 L910,180 C780,174 650,161 550,152 Z",
    aggressive: "M550,152 C650,138 780,94 910,60",
    base: "M550,152 C650,148 790,130 910,120",
    conservative: "M550,152 C650,161 790,174 910,180",
    targets: [
      { text: "10.4억 +24%", bottom: "71%", tone: "red" },
      { text: "9.1억 +8%", bottom: "48%", tone: "blue" },
      { text: "7.8억 -7%", bottom: "25%", tone: "gray" },
    ],
    axis: ["2023", "2024", "2025", "오늘", "+1년", "+2년", "+3년"],
    expectLabel: "3년 기대값 (가중)",
    expectValue: "9.2억 (+9.5%)",
  },
  "5년": {
    delta: "▼ 18.2% (5년 고점 대비)",
    fan: "M550,152 C650,130 780,72 910,32 L910,196 C780,186 650,166 550,152 Z",
    aggressive: "M550,152 C650,130 780,72 910,32",
    base: "M550,152 C650,144 790,118 910,98",
    conservative: "M550,152 C650,164 790,184 910,196",
    targets: [
      { text: "11.2억 +33%", bottom: "83%", tone: "red" },
      { text: "9.8억 +17%", bottom: "57%", tone: "blue" },
      { text: "7.6억 -10%", bottom: "18%", tone: "gray" },
    ],
    axis: ["2021", "2023", "2025", "오늘", "+1년", "+3년", "+5년"],
    expectLabel: "5년 기대값 (가중)",
    expectValue: "9.9억 (+17.8%)",
  },
  "10년": {
    delta: "▲ 96% (10년 전 대비)",
    fan: "M550,152 C660,118 790,58 910,16 L910,188 C790,180 660,164 550,152 Z",
    aggressive: "M550,152 C660,118 790,58 910,16",
    base: "M550,152 C660,138 790,100 910,72",
    conservative: "M550,152 C660,160 790,178 910,188",
    targets: [
      { text: "13.5억 +61%", bottom: "89%", tone: "red" },
      { text: "11.4억 +36%", bottom: "67%", tone: "blue" },
      { text: "8.0억 -5%", bottom: "22%", tone: "gray" },
    ],
    axis: ["2016", "2020", "2025", "오늘", "+3년", "+6년", "+10년"],
    expectLabel: "10년 기대값 (가중)",
    expectValue: "11.1억 (+32.1%)",
  },
};

const targetTone = {
  red: "text-danger",
  blue: "text-primary",
  gray: "text-text-3",
};

const LEGEND = [
  { label: "실거래", color: "#191f28" },
  { label: "적극적", color: "#d64545" },
  { label: "기준", color: "#1d4fd8" },
  { label: "보수적", color: "#8b95a1" },
];

export default function CyclePage() {
  const [period, setPeriod] = useState<PeriodKey>("3년");
  const d = PERIODS[period];

  return (
    <PageShell breadcrumb="AI 분석 › 시세·타이밍 › 공작아파트 84㎡">
      <div className="flex flex-col gap-4">
        {/* 기간 토글 */}
        <div className="rise-in flex justify-end">
          <div className="card flex gap-1 rounded-full p-[3px] text-xs">
            {(Object.keys(PERIODS) as PeriodKey[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-3.5 py-1.5 ${
                  p === period ? "chip-active" : "text-text-3"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
          {/* 팬차트 */}
          <div className="rise-in-1 card flex flex-col gap-3.5 rounded-[20px] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2.5">
                <span className="text-2xl font-extrabold text-ink">8.4억</span>
                <span className={`text-[13px] font-bold ${d.delta.startsWith("▲") ? "text-danger" : "text-primary"}`}>
                  {d.delta}
                </span>
              </div>
              <div className="flex gap-3.5 text-[11px]">
                {LEGEND.map((l) => (
                  <span key={l.label} className="flex items-center gap-[5px] text-text-2">
                    <span
                      className="h-[3px] w-3.5 rounded-[2px]"
                      style={{ background: l.color }}
                    />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative h-[250px] border-b border-line">
              <div className="absolute inset-x-0 top-[20%] border-t border-dashed border-[#eef1f6]" />
              <div className="absolute inset-x-0 top-[48%] border-t border-dashed border-[#eef1f6]" />
              <div className="absolute inset-x-0 top-[76%] border-t border-dashed border-[#eef1f6]" />
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 1000 250"
                preserveAspectRatio="none"
                className="absolute left-0 top-0"
              >
                <defs>
                  <linearGradient id="cycleFan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d64545" stopOpacity="0.10" />
                    <stop offset="50%" stopColor="#1d4fd8" stopOpacity="0.07" />
                    <stop offset="100%" stopColor="#8b95a1" stopOpacity="0.10" />
                  </linearGradient>
                  <linearGradient id="cycleHist" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#191f28" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#191f28" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={HIST_AREA} fill="url(#cycleHist)" />
                <path d={d.fan} fill="url(#cycleFan)" />
                <path d={HIST_LINE} fill="none" stroke="#191f28" strokeWidth="3" strokeLinecap="round" />
                <path
                  d={d.aggressive}
                  fill="none"
                  stroke="#d64545"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity="0.9"
                />
                <path d={d.base} fill="none" stroke="#1d4fd8" strokeWidth="3" strokeLinecap="round" />
                <path
                  d={d.conservative}
                  fill="none"
                  stroke="#8b95a1"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity="0.9"
                />
                <circle cx="220" cy="160" r="3.5" fill="#fff" stroke="#191f28" strokeWidth="2" />
                <circle cx="550" cy="152" r="5.5" fill="#191f28" stroke="#fff" strokeWidth="2.5" />
              </svg>
              {d.targets.map((t) => (
                <div
                  key={t.text}
                  className={`absolute right-0 rounded-[5px] bg-[rgba(255,255,255,.9)] px-[5px] py-0.5 text-[10px] font-extrabold ${targetTone[t.tone]}`}
                  style={{ bottom: t.bottom }}
                >
                  {t.text}
                </div>
              ))}
              <div className="absolute bottom-0 left-[55%] top-[4%] w-px border-l-[1.5px] border-dashed border-[#c9d4e5]" />
              <div className="absolute left-[49%] top-0 rounded-md bg-[rgba(25,31,40,.92)] px-[9px] py-1 text-[10px] font-bold text-white">
                오늘
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-[#adb5bd]">
              {d.axis.map((a) => (
                <span key={a}>{a}</span>
              ))}
            </div>
          </div>

          {/* 우측 */}
          <div className="flex flex-col gap-3.5">
            <div className="rise-in-2 card flex flex-col gap-2 rounded-[18px] p-[18px]">
              <div className="text-[13px] font-extrabold text-ink">시나리오 가정</div>
              <div className="flex justify-between border-b border-[#f0f3f8] py-[7px] text-xs">
                <span className="font-bold text-danger">적극적</span>
                <span className="text-text-2">금리 -1%p · 재건축 가시화 · 공급 부족</span>
              </div>
              <div className="flex justify-between border-b border-[#f0f3f8] py-[7px] text-xs">
                <span className="font-bold text-primary">기준</span>
                <span className="text-text-2">금리 동결 · 과거 사이클 평균 회복</span>
              </div>
              <div className="flex justify-between py-[7px] text-xs">
                <span className="font-bold text-text-3">보수적</span>
                <span className="text-text-2">금리 +1%p · 입주 물량 증가</span>
              </div>
            </div>

            <div className="rise-in-3 ai-panel flex flex-col gap-2 rounded-[18px] p-[18px]">
              <div className="flex items-center gap-[7px]">
                <span className="ai-chip h-5 w-5 text-[10px]">AI</span>
                <span className="text-[13px] font-extrabold text-white">사이클 판단</span>
              </div>
              <div className="text-xs leading-[1.65] text-ai-text">
                10년 사이클상 현재는 <b className="text-ai-accent">하락 후반~바닥 구간</b>. 기준
                시나리오 확률 55%, 적극 25%, 보수 20%. 보수 시나리오여도 -7% 하방으로,{" "}
                <b className="text-white">손실 폭 대비 상방이 큰 비대칭 구간</b>입니다.
              </div>
              <div className="flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-[9px] text-xs">
                <span className="text-ai-muted">{d.expectLabel}</span>
                <span className="font-extrabold text-ai-accent">{d.expectValue}</span>
              </div>
            </div>

            {/* AD 슬롯 */}
            <div className="rise-in-4 flex h-[72px] flex-col items-center justify-center gap-[3px] rounded-[14px] border border-dashed border-[#d8dfea] bg-surface">
              <span className="rounded border border-[#e2e7ee] px-1.5 py-px text-[9px] font-bold tracking-[1px] text-[#adb5bd]">
                AD
              </span>
              <span className="font-mono text-[11px] text-[#adb5bd]">AdSense 320×72</span>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
