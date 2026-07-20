import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { SimulationNotice } from "../../components/ExampleBadge";

const SIM_ROWS = [
  { label: "추가 필요 자금", value: "2.4억 (취득세 포함)", tone: "white" },
  { label: "양도세 (1주택 비과세)", value: "0원 예상", tone: "accent" },
  { label: "월 부담 변화", value: "98만 → 164만", tone: "white" },
] as const;

const REBAL_ROWS = [
  { label: "검단 매도 시 실현손익", value: "-1,600만 (세전)", tone: "pink" },
  { label: "보유 유지 시 연 순수익", value: "+490만 (공실 1개월 가정)", tone: "white" },
] as const;

const ALERTS = [
  "월 순자산 리포트 (매월 1일)",
  "보유 단지 시세 ±3% 변동",
  "대환 실익 발생 시 (금리)",
];

export default function PortfolioPage() {
  return (
    <PageShell breadcrumb="AI 분석 › 포트폴리오">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">포트폴리오 분석</h1>
        <Link href="/my/assets" className="btn-soft rounded-[10px] px-3.5 py-2 text-[13px] no-underline">
          ＋ 자산 등록
        </Link>
      </div>
      <div className="rise-in mb-3">
        <SimulationNotice text="아래 자산·수치는 예시 데이터예요. 자산 등록 기능이 열리면 내 자산 기준으로 계산됩니다." />
      </div>

      <div className="flex flex-col gap-4">
        {/* 요약 카드 4열 */}
        <div className="rise-in-1 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <div className="card rounded-2xl p-[18px]">
            <div className="text-xs text-text-3">총 자산 가치</div>
            <div className="mt-1 text-[22px] font-extrabold text-ink">14.2억</div>
          </div>
          <div className="card rounded-2xl p-[18px]">
            <div className="text-xs text-text-3">총 부채</div>
            <div className="mt-1 text-[22px] font-extrabold text-ink">
              4.8억 <span className="text-xs font-medium text-text-3">LTV 34%</span>
            </div>
          </div>
          <div className="card rounded-2xl p-[18px]">
            <div className="text-xs text-text-3">순자산</div>
            <div className="mt-1 text-[22px] font-extrabold text-primary">9.4억</div>
          </div>
          <div className="card rounded-2xl p-[18px]">
            <div className="text-xs text-text-3">3개월 변동</div>
            <div className="mt-1 text-[22px] font-extrabold text-danger">▼ 3,200만</div>
          </div>
        </div>

        {/* 보유 자산 + 갈아타기 시뮬레이션 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_460px]">
          <div className="rise-in-2 card flex flex-col gap-3 rounded-[20px] p-[22px]">
            <div className="text-[15px] font-extrabold text-ink">보유 자산</div>
            <div className="flex items-center justify-between border-b border-[#f0f3f8] py-3">
              <div>
                <div className="text-sm font-bold text-ink">
                  평촌 초원마을 59㎡{" "}
                  <span className="rounded-[5px] bg-primary-soft px-[7px] py-0.5 text-[10px] font-extrabold text-primary">
                    실거주
                  </span>
                </div>
                <div className="mt-[3px] text-[11px] text-text-3">2019 취득 · 대출 잔액 2.1억</div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-extrabold text-ink">6.8억</div>
                <div className="text-[11px] font-bold text-primary">▼ 1.8% (3M)</div>
              </div>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-bold text-ink">
                  인천 검단 오피스텔{" "}
                  <span className="rounded-[5px] bg-[#fdf3e7] px-[7px] py-0.5 text-[10px] font-extrabold text-[#c07a3a]">
                    임대
                  </span>
                </div>
                <div className="mt-[3px] text-[11px] text-text-3">2021 취득 · 보증금 5천/월세 65</div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-extrabold text-ink">2.4억</div>
                <div className="text-[11px] font-bold text-danger">▼ 6.2% (3M)</div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-bg px-3.5 py-3">
              <span className="text-xs text-text-2">후보: 공작아파트 84㎡ (8.4억)</span>
              <Link href="/analysis/switch" className="text-xs font-bold text-primary no-underline">
                갈아타기 시뮬레이션 ›
              </Link>
            </div>
          </div>

          <div className="rise-in-3 ai-panel flex flex-col gap-3 rounded-[20px] p-[22px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
            <div className="flex items-center gap-2">
              <span className="ai-chip h-[22px] w-[22px] rounded-[7px] text-[11px]">AI</span>
              <span className="text-sm font-extrabold text-white">갈아타기 시뮬레이션</span>
            </div>
            <div className="text-xs leading-[1.65] text-ai-text">
              초원마을 매도(6.8억) + 공작 매수(8.4억) 시:
            </div>
            <div className="flex flex-col gap-1.5">
              {SIM_ROWS.map((r) => (
                <div
                  key={r.label}
                  className="flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-[9px] text-xs"
                >
                  <span className="text-ai-muted">{r.label}</span>
                  <span
                    className={`font-extrabold ${r.tone === "accent" ? "text-ai-accent" : "text-white"}`}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-xs leading-[1.6] text-ai-text">
              ⚠ 오피스텔 보유로 취득세 중과 여부는 <b className="text-ai-accent">세무사 확인</b>이
              필요합니다.
            </div>
            <div className="text-[9px] leading-[1.5] text-ai-muted">
                본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
              </div>
            <Link href="/town/experts" className="btn-primary rounded-xl p-[11px] text-center text-[13px] no-underline">
              세무사 상담 연결
            </Link>
          </div>
        </div>

        {/* ---------- 포트폴리오+ (10e) — 추이 · 구성 · 리밸런싱 ---------- */}
        <div className="mt-1 flex items-center justify-between">
          <div className="text-[15px] font-extrabold text-ink">순자산 추이 · 리밸런싱</div>
          <div className="card flex gap-1 rounded-full p-[3px] text-xs">
            <span className="px-3 py-1.5 text-text-3">1년</span>
            <span className="chip-active rounded-full px-3 py-1.5">3년</span>
            <span className="px-3 py-1.5 text-text-3">전체</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-3.5">
            {/* 순자산 추이 */}
            <div className="rise-in-4 card flex flex-col gap-2.5 rounded-[20px] px-6 py-[22px]">
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-extrabold text-ink">순자산 추이</span>
                <span className="text-xs text-text-2">
                  현재 <b className="text-primary">9.4억</b> · 3년 +2.1억
                </span>
              </div>
              <div className="relative h-[170px]">
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 1000 170"
                  preserveAspectRatio="none"
                  className="absolute left-0 top-0"
                >
                  <defs>
                    <linearGradient id="pfTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1d4fd8" stopOpacity="0.14" />
                      <stop offset="100%" stopColor="#1d4fd8" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,130 C120,124 220,110 340,96 C460,82 560,88 680,80 C800,72 900,58 990,48 L990,170 L0,170 Z"
                    fill="url(#pfTrend)"
                  />
                  <path
                    d="M0,130 C120,124 220,110 340,96 C460,82 560,88 680,80 C800,72 900,58 990,48"
                    fill="none"
                    stroke="#1d4fd8"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <circle cx="990" cy="48" r="5" fill="#1d4fd8" stroke="#fff" strokeWidth="2.5" />
                </svg>
                <div className="absolute left-[33%] top-[64%] text-[10px] text-text-3">검단 취득</div>
                <div className="absolute right-0 top-[12%] rounded-[5px] bg-[rgba(255,255,255,.9)] px-[5px] py-0.5 text-[11px] font-extrabold text-primary">
                  9.4억
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-[#adb5bd]">
                <span>2023</span>
                <span>2024</span>
                <span>2025</span>
                <span>2026</span>
              </div>
            </div>

            {/* 자산 구성 */}
            <div className="rise-in-5 card flex flex-col gap-3 rounded-[20px] px-6 py-[22px]">
              <div className="text-[15px] font-extrabold text-ink">자산 구성</div>
              <div className="flex h-[26px] overflow-hidden rounded-lg">
                <div className="flex w-[48%] items-center justify-center bg-primary text-[10px] font-bold text-white">
                  실거주 6.8억
                </div>
                <div className="flex w-[17%] items-center justify-center bg-[#7ea2ff] text-[10px] font-bold text-white">
                  임대 2.4억
                </div>
                <div className="flex w-[35%] items-center justify-center bg-[#c9d4e5] text-[10px] font-bold text-[#33415e]">
                  현금·금융 5.0억
                </div>
              </div>
              <div className="flex flex-wrap justify-between gap-1 text-xs text-text-2">
                <span>
                  부동산 비중 65% <span className="font-bold text-danger">(권장 55~60% 초과)</span>
                </span>
                <span>레버리지(LTV) 34% · 안전</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
            {/* AI 리밸런싱 제안 */}
            <div className="rise-in-4 ai-panel flex flex-col gap-2.5 rounded-[18px] p-5">
              <div className="flex items-center gap-2">
                <span className="ai-chip h-[22px] w-[22px] rounded-[7px] text-[11px]">AI</span>
                <span className="text-sm font-extrabold text-white">리밸런싱 제안</span>
              </div>
              <div className="text-xs leading-[1.65] text-ai-text">
                ① 검단 오피스텔(-6.2%, 월세수익률 3.1%)은{" "}
                <b className="text-ai-accent">매도 후 갈아타기 자금 편입</b> 검토 — 취득세 중과 해소
                효과 겸함. ② 갈아타기 실행 시 부동산 비중 72%로 상승 —{" "}
                <b className="text-white">예비비 1,000만 + 6개월 생활비</b>는 반드시 현금 유지.
              </div>
              {REBAL_ROWS.map((r) => (
                <div
                  key={r.label}
                  className="flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-[9px] text-xs"
                >
                  <span className="text-ai-muted">{r.label}</span>
                  <span
                    className={`font-extrabold ${r.tone === "pink" ? "text-[#d6708b]" : "text-white"}`}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
              <div className="text-[9px] leading-[1.5] text-ai-muted">
                본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
              </div>
              <Link
                href="/analysis/scenario"
                className="btn-primary rounded-[10px] p-[11px] text-center text-xs no-underline"
              >
                매도 vs 보유 시나리오 비교
              </Link>
            </div>

            {/* 자산 알림 */}
            <div className="rise-in-5 card flex flex-col gap-2 rounded-[18px] p-[18px]">
              <div className="text-[13px] font-extrabold text-ink">자산 알림</div>
              {/* 장식용 가짜 토글 제거 — 실제 알림 설정으로 연결 */}
              {ALERTS.map((a) => (
                <div key={a} className="text-xs text-text-1">
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
      </div>
    </PageShell>
  );
}
