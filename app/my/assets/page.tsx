import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";

const REPAY_STATS = [
  { label: "남은 대출금", value: "2.1억", tone: "text-ink" },
  { label: "납부한 이자 누계", value: "6,240만", tone: "text-danger" },
  { label: "남은 원리금 총액", value: "2.62억", tone: "text-ink" },
  { label: "월 상환액 (잔여 23년)", value: "98만원", tone: "text-ink" },
] as const;

function Chip({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1.5 text-xs ${
        active
          ? "border-[1.5px] border-primary bg-primary-soft font-bold text-primary"
          : "border border-[#e2e7ee] bg-surface text-text-2"
      }`}
    >
      {label}
    </span>
  );
}

export default function AssetsPage() {
  return (
    <PageShell breadcrumb="마이 › 자산 등록">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3">
        <div className="rise-in flex items-center justify-between">
          <Link href="/my" className="text-base text-text-1" aria-label="닫기">
            ✕
          </Link>
          <h1 className="text-[15px] font-extrabold text-ink">자산 등록</h1>
          <span className="text-[13px] font-bold text-primary">저장</span>
        </div>

        <div className="rise-in-1 card flex items-center gap-2 rounded-[14px] px-3.5 py-3">
          <span className="text-sm">🏠</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-ink">평촌 초원마을 6단지 512동</div>
            <div className="text-[11px] text-text-3">주소 검색 자동 인식 · 59㎡</div>
          </div>
          <span className="text-[#c3cad6]">›</span>
        </div>

        <div className="rise-in-2 card flex flex-col gap-2.5 rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <span className="w-14 text-xs text-text-2">형태</span>
            <div className="flex gap-1.5">
              <Chip label="실거주" active />
              <Chip label="임대 중" />
              <Chip label="분양권" />
            </div>
          </div>
          <div className="flex justify-between border-t border-[#f0f3f8] pt-2 text-[13px]">
            <span className="text-text-2">취득 시기 / 취득가</span>
            <span className="font-extrabold text-ink">2019.05 · 4.9억</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-text-2">
              현재 시세 <span className="text-[10px] text-primary">자동</span>
            </span>
            <span className="font-extrabold text-ink">
              6.8억 <span className="text-[11px] text-primary">▼1.8%</span>
            </span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-text-2">대출 은행 / 상품</span>
            <span className="font-extrabold text-ink">K은행 주담대 (변동) ▾</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-text-2">최초 대출금 / 금리</span>
            <span className="font-extrabold text-ink">2.9억 · 3.8%</span>
          </div>
        </div>

        <div className="rise-in-3 card flex flex-col gap-2.5 rounded-2xl p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-extrabold text-ink">
              대출 상환 현황 <span className="text-[10px] font-bold text-primary">자동 계산</span>
            </span>
            <span className="text-[11px] text-text-3">2019.06 ~ · 87회차</span>
          </div>
          <div className="flex flex-col gap-[5px]">
            <div className="flex justify-between text-[11px]">
              <span className="text-text-3">상환 진행률</span>
              <span className="font-extrabold text-primary">28% (0.8억 상환)</span>
            </div>
            <div className="relative h-1.5 rounded-[3px] bg-[#eef1f6]">
              <div className="absolute left-0 top-0 h-1.5 w-[28%] rounded-[3px] bg-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {REPAY_STATS.map((s) => (
              <div key={s.label} className="rounded-[10px] bg-bg px-3 py-2.5">
                <div className="text-[10px] text-text-3">{s.label}</div>
                <div className={`text-[15px] font-extrabold ${s.tone}`}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-[5px] rounded-xl bg-[rgba(29,79,216,.06)] px-[13px] py-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-primary">
                갈아탈 만한 대출 (대환 추천)
              </span>
              <span className="text-[10px] text-[#5b74b8]">07.19 기준</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#5b74b8]">S은행 대환 고정 3.42%</span>
              <span className="font-extrabold text-primary">월 -9.8만 · 총 -2,700만</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#5b74b8]">보금자리론 고정 3.60%</span>
              <span className="font-extrabold text-text-1">월 -5.2만 · 중도상환수수료 0</span>
            </div>
            <div className="text-[10px] text-text-3">
              중도상환수수료(잔여 0.4%) 반영한 실익 기준 · 자세히 ›
            </div>
          </div>
        </div>

        <div className="rise-in-4 card flex flex-col gap-2.5 rounded-2xl p-4">
          <div className="text-[13px] font-extrabold text-ink">세금·대출 판정 정보</div>
          <div className="flex items-center gap-2">
            <span className="w-[76px] text-xs text-text-2">보유 주택</span>
            <div className="flex gap-1.5">
              <Chip label="1주택" />
              <Chip label="2주택" active />
              <Chip label="3+" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[76px] text-xs text-text-2">생애최초</span>
            <div className="flex gap-1.5">
              <Chip label="해당" />
              <Chip label="비해당" active />
            </div>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-text-2">거주 기간</span>
            <span className="font-extrabold text-ink">
              7년 2개월 <span className="text-[10px] text-primary">비과세 요건 충족</span>
            </span>
          </div>
        </div>

        <div className="rise-in-5 ai-panel flex flex-col gap-1.5 rounded-2xl p-4">
          <div className="text-xs font-extrabold text-[#7ea2ff]">등록하면 바로</div>
          <div className="text-xs leading-[1.6] text-ai-text">
            순자산·LTV 자동 계산 · 갈아타기 시뮬레이션 · 양도세 예상 · 시세 변동 알림
          </div>
        </div>
      </div>
    </PageShell>
  );
}
