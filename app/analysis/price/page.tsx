import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";
import { NextActions } from "../../components/NextActions";

const STEPS = [
  { label: "기준가 — 최근 6개월 동일평형 실거래 9건 회귀", value: "8.31억", tone: "ink" },
  { label: "층 보정 (5층 / 15층 · 중저층 -1.8%)", value: "-0.15억", tone: "red" },
  { label: "수리 상태 보정 (올수리 2024 · +2.4%)", value: "+0.20억", tone: "blue" },
  { label: "향·동 위치 보정 (남향 · 도로변 302동 -0.7%)", value: "-0.06억", tone: "red" },
  { label: "시장 모멘텀 보정 (하락 둔화 구간 -1.2%)", value: "-0.10억", tone: "red" },
  { label: "실거래 변동 보정 (최근 30일 2건 · 직전 대비 -1.5%)", value: "-0.12억", tone: "red" },
  {
    label: "호가 변동 보정 (2주간 호가 하향 4건 · 매물 12→15건 +0.6%p 하방)",
    value: "-0.05억",
    tone: "red",
  },
] as const;

const stepTone = { ink: "text-ink", red: "text-danger", blue: "text-primary" };

const BARS = [
  { left: "2%", height: "30%", color: "#dbe3f2" },
  { left: "13%", height: "55%", color: "#a9bde8" },
  { left: "24%", height: "100%", color: "#1d4fd8" },
  { left: "35%", height: "80%", color: "#a9bde8" },
  { left: "46%", height: "45%", color: "#dbe3f2" },
  { left: "57%", height: "25%", color: "#dbe3f2" },
] as const;

const COSTS = [
  { label: "취득세 (1.0% · 생애최초 -200만)", value: "590만" },
  { label: "중개보수 (0.5% 상한 · 협의)", value: "395만" },
  { label: "등기비 (법무사·인지·채권할인)", value: "약 120만" },
  { label: "이사 + 입주청소 (84㎡ 평균)", value: "약 180만" },
] as const;

const EXPERTS = [
  { name: "김OO 중개사", verified: true, meta: "★4.9 · 협상 상담 3만원", action: "문의 ›" },
  { name: "최OO 법무사", verified: true, meta: "소유권이전 등기 대행 35만~", action: "견적 ›" },
  { name: "OO익스프레스 이사", verified: false, meta: "★4.7 · 84㎡ 포장이사 130만~", action: "견적 ›" },
  { name: "OO디자인 인테리어", verified: false, meta: "★4.8 · 부분 수리 견적 무료", action: "견적 ›" },
] as const;

export default function PricePage() {
  return (
    <PageShell breadcrumb="매물 A (공작 84A 급매 7.9억) › AI 제안가 근거">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">AI 제안가 상세</h1>
        <span className="text-[11px] text-[#adb5bd]">참고용 · 투자 판단 책임은 이용자에게</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        {/* 좌: 산출 과정 + 분포 */}
        <div className="flex flex-col gap-3">
          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-[18px] px-[22px] py-5">
            <div className="text-sm font-extrabold text-ink">제안가 산출 과정</div>
            {STEPS.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between gap-3 border-b border-[#f0f3f8] py-[9px] text-[13px]"
              >
                <span className="text-text-2">{s.label}</span>
                <span className={`shrink-0 font-extrabold ${stepTone[s.tone]}`}>{s.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-b border-[#f0f3f8] py-[9px] text-[13px]">
              <span className="text-text-2">
                정비사업 보정 (재건축 예비추진위 · 동의율 30%대 초기 +2.1%)
                <span className="mt-0.5 block text-[10px] text-text-3">
                  리모델링 — · 재개발 인접(관양) 반사효과 포함 · 도심복합·가로주택 해당 없음
                </span>
              </span>
              <span className="shrink-0 font-extrabold text-primary">+0.17억</span>
            </div>
            <div className="flex justify-between rounded-[10px] bg-[rgba(29,79,216,.05)] px-3 py-[11px] text-sm font-extrabold text-primary">
              <span>AI 적정가 (신뢰구간 ±0.15억)</span>
              <span>8.20억</span>
            </div>
            <div className="text-[11px] text-text-3">
              호가 7.9억은 적정가 대비 -3.7% — 진성 급매 판정 (하위 8% 가격대) · 하락
              보정(실거래·호가)과 상승 보정(정비사업)이 상쇄된 결과
            </div>
          </div>

          <div className="rise-in-2 card flex flex-col gap-2 rounded-[18px] px-[22px] py-5">
            <div className="text-sm font-extrabold text-ink">가격대 분포 — 현재 매물 12건</div>
            <div className="relative mt-1 h-16">
              {BARS.map((b, i) => (
                <div
                  key={i}
                  className="absolute bottom-0 w-[9%] rounded-t"
                  style={{ left: b.left, height: b.height, background: b.color }}
                />
              ))}
              <div className="absolute left-[4%] top-[-4px] text-[10px] font-extrabold text-danger">
                ▼ 이 매물 7.9억
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-[#adb5bd]">
              <span>7.9</span>
              <span>8.1</span>
              <span>8.3</span>
              <span>8.5</span>
              <span>8.7</span>
              <span>8.9억</span>
            </div>
          </div>
        </div>

        {/* 우 */}
        <div className="flex flex-col gap-3.5">
          <div className="rise-in-1">
            <AIPanel title="협상 전략" className="rounded-[18px]">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-[9px]">
                  <span className="text-ai-muted">1차 제안가</span>
                  <span className="font-extrabold text-ai-accent">7.75억</span>
                </div>
                <div className="flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-[9px]">
                  <span className="text-ai-muted">타결 목표선</span>
                  <span className="font-extrabold text-white">7.8~7.85억</span>
                </div>
                <div className="flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-[9px]">
                  <span className="text-ai-muted">이탈 상한 (적정가)</span>
                  <span className="font-extrabold text-[#d6708b]">8.20억</span>
                </div>
                <div className="leading-[1.65]">
                  근거 카드: ① 도로변 동 소음 (내 노트 3회 확인) ② 저녁 이중주차 사진 ③ 최근 5층
                  실거래 8.15억 → 매도인 급한 사정 확인 시 7.75억 제시가 유효합니다.
                </div>
              </div>
            </AIPanel>
          </div>

          <div className="rise-in-2 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">이 가격이면</div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">월 원리금 (권장 대출 2.5억)</span>
              <span className="font-extrabold text-primary">103만원</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">적정가 대비 안전마진</span>
              <span className="font-extrabold text-ink">+0.30억</span>
            </div>
            <Link
              href="/messages"
              className="btn-soft mt-1 rounded-[10px] p-2.5 text-center text-xs no-underline"
            >
              중개사에게 협상 근거와 함께 문의
            </Link>
          </div>

          <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-extrabold text-ink">
                거래 부대비용{" "}
                <span className="text-[10px] font-bold text-primary">7.9억 기준 자동 계산</span>
              </span>
              <span className="text-[10px] text-text-3">생애최초 감면 반영</span>
            </div>
            {COSTS.map((c) => (
              <div
                key={c.label}
                className="flex justify-between border-b border-[#f0f3f8] py-1.5 text-xs"
              >
                <span className="text-text-2">{c.label}</span>
                <span className="font-extrabold text-ink">{c.value}</span>
              </div>
            ))}
            <div className="flex justify-between pb-0.5 pt-2 text-xs font-extrabold">
              <span className="text-ink">부대비용 합계</span>
              <span className="text-danger">약 1,285만</span>
            </div>
            <div className="text-[10px] text-[#adb5bd]">
              올수리 매물로 인테리어 비용 0원 가정 · 항목별 조정 가능 ›
            </div>
          </div>

          <div className="rise-in-4 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">
              이 거래에 필요한 전문가{" "}
              <span className="text-[10px] font-medium text-text-3">인증 · 관양동 활동 기준</span>
            </div>
            {EXPERTS.map((e, i) => (
              <div
                key={e.name}
                className={`flex items-center justify-between py-1.5 text-xs ${
                  i < EXPERTS.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <div>
                  <div className="font-bold text-ink">
                    {e.name}{" "}
                    {e.verified && (
                      <span className="rounded bg-primary-soft px-[5px] py-px text-[9px] font-extrabold text-primary">
                        인증
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-text-3">{e.meta}</div>
                </div>
                <span className="text-[11px] font-bold text-primary">{e.action}</span>
              </div>
            ))}
            <div className="text-[10px] text-[#adb5bd]">
              추천은 평점·응답속도 기준이며 광고비 영향을 받지 않습니다
            </div>
          </div>
        </div>
      </div>

      {/* 15h-44 분석→행동: 결과 끝 다음 행동 카드 */}
      <div className="mt-4">
        <NextActions
          actions={[
            { label: "이 단지 노트 쓰기", href: "/notes/new", primary: true },
            { label: "비교에 추가", href: "/analysis/compare" },
            { label: "협상 스크립트 보기", href: "/analysis" },
          ]}
        />
      </div>
    </PageShell>
  );
}
