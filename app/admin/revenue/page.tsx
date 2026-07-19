/* 시안 16i — 관리자 수익 대시보드 (RBAC: 운영·재무만)
   데스크탑: KPI 8종 + 결제 실패·환불 분쟁 큐 / 모바일: 읽기 전용 요약 */

const KPIS = [
  { label: "MRR", value: "2,140만", delta: "+6.2%", tone: "up" },
  { label: "ARR (run-rate)", value: "2.57억", delta: "—", tone: "flat" },
  { label: "유료 전환율", value: "3.4%", delta: "-0.2%p", tone: "down" },
  { label: "해지율 (월)", value: "2.1%", delta: "-0.4%p", tone: "up" },
  { label: "ARPPU", value: "14,800원", delta: "+320", tone: "up" },
  { label: "리포트 GMV", value: "890만", delta: "+18%", tone: "up" },
  { label: "전문가 GMV", value: "340만", delta: "파일럿", tone: "flat" },
  { label: "수수료 매출 (순)", value: "118만", delta: "PG 비용 차감", tone: "flat" },
] as const;

const MOBILE_KPIS = [
  { label: "MRR", value: "2,140만", accent: false },
  { label: "전환율", value: "3.4%", accent: false },
  { label: "해지율", value: "2.1%", accent: true },
  { label: "GMV 합", value: "1,230만", accent: false },
] as const;

const deltaColor = {
  up: "text-[#4ade80]",
  down: "text-[#e06a6a]",
  flat: "text-[#9aa6b8]",
} as const;

const darkCard =
  "rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)]";

export default function AdminRevenuePage() {
  return (
    <>
      {/* 헤더 */}
      <div className="rise-in flex flex-wrap items-center justify-between gap-3">
        <div className="text-[19px] font-extrabold text-white">
          수익 대시보드{" "}
          <span className="text-xs font-medium text-[#9aa6b8]">
            RBAC: 운영·재무만
          </span>
        </div>
        <div className="hidden gap-2 text-xs md:flex">
          <span className="rounded-[10px] bg-[rgba(255,255,255,.07)] px-3.5 py-[7px] font-semibold text-[#c9d2e0]">
            이번 달
          </span>
          <span className="px-3.5 py-[7px] text-[#9aa6b8]">분기</span>
          <span className="px-3.5 py-[7px] text-[#9aa6b8]">연간</span>
        </div>
      </div>

      {/* ===== 모바일 요약 (읽기 전용) ===== */}
      <section className="flex flex-col gap-3 md:hidden">
        <div className="rise-in-1 flex items-center justify-between px-0.5">
          <span className="text-[13px] font-extrabold text-white">
            Admin · 수익 요약
          </span>
          <span className="text-[10px] text-[#9aa6b8]">모바일 (읽기 전용)</span>
        </div>
        <div className="rise-in-1 grid grid-cols-2 gap-2">
          {MOBILE_KPIS.map((k) => (
            <div key={k.label} className={`${darkCard} p-3`}>
              <div className="text-[10px] text-[#9aa6b8]">{k.label}</div>
              <div
                className={`mt-0.5 text-[17px] font-extrabold tabular-nums ${
                  k.accent ? "text-[#5fbf8a]" : "text-white"
                }`}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>
        <div className="rise-in-2 rounded-[10px] bg-[rgba(214,69,69,.16)] px-3 py-2.5 text-xs font-bold text-[#e06a6a]">
          ⚠ 결제 실패 9 · 분쟁 4 — 데스크탑에서 처리
        </div>
        <div className="rise-in-2 text-[11px] text-[#9aa6b8]">
          모바일은 모니터링 전용 — 환불·정산 실행은 데스크탑 + 2차 인증
        </div>
      </section>

      {/* ===== 데스크탑 ===== */}
      <section className="hidden flex-col gap-4 md:flex">
        {/* KPI 8종 */}
        <div className="rise-in-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KPIS.map((k) => (
            <div key={k.label} className={`${darkCard} p-4`}>
              <div className="text-[11px] text-[#9aa6b8]">{k.label}</div>
              <div className="mt-1 text-[20px] font-extrabold tabular-nums text-white">
                {k.value}
              </div>
              <div className={`mt-0.5 text-[11px] font-bold ${deltaColor[k.tone]}`}>
                {k.delta}
              </div>
            </div>
          ))}
        </div>

        {/* 결제 실패 · 환불 분쟁 큐 */}
        <div className="rise-in-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className={`${darkCard} flex flex-col gap-2 p-[18px]`}>
            <div className="text-sm font-extrabold text-white">
              결제 실패 · 유예 중 9건
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[rgba(242,201,76,.12)] px-3 py-2 text-xs">
              <span className="font-bold text-[#f2c94c]">
                유예 D-1 · 3건 — 재시도 예약됨
              </span>
              <button type="button" className="font-bold text-[#7ea2ff]">
                보기
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[rgba(255,255,255,.05)] px-3 py-2 text-xs">
              <span className="text-[#c9d2e0]">
                중복 결제 자동 탐지 · 이번 주 2건 자동 환불
              </span>
              <button type="button" className="text-[#9aa6b8]">
                로그
              </button>
            </div>
          </div>

          <div className={`${darkCard} flex flex-col gap-2 p-[18px]`}>
            <div className="text-sm font-extrabold text-white">환불·분쟁 큐 4건</div>
            <div className="flex items-center justify-between rounded-lg bg-[rgba(214,69,69,.14)] px-3 py-2 text-xs">
              <span className="font-bold text-[#e06a6a]">
                &quot;설명과 다름&quot; 리포트 분쟁 — 해당 주문 정산 보류
              </span>
              <button type="button" className="font-bold text-[#7ea2ff]">
                처리
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[rgba(255,255,255,.05)] px-3 py-2 text-xs">
              <span className="text-[#c9d2e0]">
                AI 리포트 생성 실패 1건 — 자동 전액 환불 완료
              </span>
              <button type="button" className="text-[#9aa6b8]">
                확인
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
