import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";

const CHECKLIST = [
  { label: "소유자 = 계약 상대방 일치", result: "확인 ✓", tone: "text-primary" },
  { label: "깡통전세 위험 (매매가 대비 보증금+채권)", result: "83% · 경계 아래 ✓", tone: "text-primary" },
  { label: "불법 건축물 여부", result: "해당 없음 ✓", tone: "text-primary" },
  { label: "임대인 세금 체납 열람 동의", result: "계약 전 요청 필요", tone: "text-[#c07a3a]" },
  { label: "HUG 보증보험 가입 가능성", result: "가능 (보증료 연 61만 추정)", tone: "text-primary" },
] as const;

export default function SafetyPage() {
  return (
    <PageShell breadcrumb="전세·월세 모드 › 세입자 안전 분석" wide>
      {/* 상단 모드 전환 + 대상 매물 (11e 헤더) */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-line bg-surface p-[3px] text-xs">
          <span className="rounded-full px-3.5 py-1.5 text-text-3">매매</span>
          <span className="rounded-full bg-ink px-3.5 py-1.5 font-bold text-white">전세</span>
          <span className="rounded-full px-3.5 py-1.5 text-text-3">월세</span>
        </div>
        <span className="text-[13px] text-text-3">공작아파트 84A 전세 4.9억 매물</span>
        <div className="flex-1" />
        <button type="button" className="btn-primary rounded-[10px] px-4 py-2 text-[13px]">
          안전 진단 실행
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-3.5">
          {/* 핵심 3지표 (11e) */}
          <div className="rise-in-1 grid gap-3 md:grid-cols-3">
            <div className="ai-panel rounded-2xl p-[18px]">
              <div className="text-[11px] text-ai-muted">전세 안전 점수</div>
              <div className="mt-1 text-2xl font-extrabold text-[#7ea2ff]">74 / 100</div>
              <div className="mt-[3px] text-[10px] text-ai-muted">보증보험 가입 가능 구간</div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-[11px] text-text-3">전세가율</div>
              <div className="mt-1 text-2xl font-extrabold text-ink">58%</div>
              <div className="mt-[3px] text-[10px] font-bold text-primary">안전 (위험 기준 80%)</div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-[11px] text-text-3">선순위 채권 (등기부 자동 분석)</div>
              <div className="mt-1 text-2xl font-extrabold text-danger">2.1억</div>
              <div className="mt-[3px] text-[10px] font-bold text-danger">
                근저당 1건 — 말소 조건 확인 필요
              </div>
            </div>
          </div>

          {/* 세입자 체크리스트 (11e) */}
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[20px] p-[22px]">
            <div className="text-[15px] font-extrabold text-ink">
              세입자 체크리스트{" "}
              <span className="text-[11px] font-medium text-text-3">등기부·건축물대장 자동 대조</span>
            </div>
            {CHECKLIST.map((c, i) => (
              <div
                key={c.label}
                className={`flex justify-between py-[9px] text-[13px] ${
                  i < CHECKLIST.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <span className="text-text-1">{c.label}</span>
                <span className={`font-extrabold ${c.tone}`}>{c.result}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-3.5">
          <div className="rise-in-3">
            <AIPanel title="계약 전 필수 3가지" className="rounded-[18px]">
              ① 잔금일에 <b className="text-[#7ea2ff]">근저당 말소 동시 진행</b> 특약 ② 전입신고+확정일자
              즉시 (대항력) ③ 임대인 국세 완납증명 요청 — 거부 시 계약 재고
              <div className="btn-primary mt-2.5 rounded-[10px] p-[11px] text-center text-xs">
                특약 문구 자동 생성
              </div>
            </AIPanel>
          </div>
          <div className="rise-in-4 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">전세 vs 월세 vs 매수</div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">전세 4.9억 (대출 2억)</span>
              <span className="font-extrabold text-ink">월 71만</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">월세 5천/160</span>
              <span className="font-extrabold text-ink">월 175만</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">매수 7.9억 급매</span>
              <span className="font-extrabold text-primary">월 103만 + 자산</span>
            </div>
            <div className="text-[10px] text-[#adb5bd]">세액공제·기회비용 반영 상세 비교 ›</div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
