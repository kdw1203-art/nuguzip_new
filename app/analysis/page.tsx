import Link from "next/link";
import { PageShell } from "../components/PageShell";

const TOOLS = [
  {
    href: "/notes",
    icon: "📝",
    title: "임장노트 분석",
    desc: "기록을 점수화하고 장단점·체크 제안을 정리",
    foot: "노트 7건 분석 완료 ›",
  },
  {
    href: "/analysis/compare",
    icon: "⚖️",
    title: "후보 단지 비교",
    desc: "같은 기준으로 항목·재무를 나란히 비교",
    foot: "공작 vs 동편3 갱신됨 ›",
  },
  {
    href: "/analysis/scenario",
    icon: "📊",
    title: "시장·대출 시나리오",
    desc: "금리·시세 변동 시나리오별 원리금 스트레스 테스트",
    foot: "시나리오 3개 저장됨 ›",
  },
  {
    href: "/analysis/timing",
    icon: "⏱",
    title: "시세·타이밍 분석",
    desc: "지역 사이클 위치와 매수 적기 신호를 판단",
    foot: "관양동 브리핑 보기 ›",
  },
  {
    href: "/analysis/portfolio",
    icon: "💼",
    title: "포트폴리오 분석",
    desc: "보유·후보 자산의 구성과 갈아타기 시뮬레이션",
    foot: "자산 2건 등록됨 ›",
  },
] as const;

const QUICK = [
  { href: "/analysis/cycle", label: "시세 사이클 — 공작 84㎡" },
  { href: "/analysis/price", label: "AI 제안가 상세 — 급매 7.9억" },
  { href: "/analysis/switch", label: "갈아타기 추천 지역" },
] as const;

export default function AnalysisHubPage() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div className="rise-in px-1">
          <div className="text-[26px] font-extrabold text-ink">AI 분석 도구</div>
          <div className="mt-1.5 text-sm text-text-2">
            내 노트와 실거래 데이터가 연결된 5가지 분석
          </div>
        </div>

        <div className="rise-in-1 grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <Link
              key={t.title}
              href={t.href}
              className="card card-hover flex flex-col gap-2.5 rounded-[20px] p-[22px] no-underline"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-[19px]">
                {t.icon}
              </div>
              <div className="text-base font-extrabold text-ink">{t.title}</div>
              <div className="text-[13px] leading-[1.55] text-text-2">
                {t.desc}
              </div>
              <div className="text-xs font-bold text-primary">{t.foot}</div>
            </Link>
          ))}

          {/* 무엇이든 물어보기 — 잉크 다크 카드 */}
          <div className="ai-panel flex flex-col gap-2.5 rounded-[20px] p-[22px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
            <div className="ai-chip h-10 w-10 rounded-xl text-[15px]">AI</div>
            <div className="text-base font-extrabold text-white">
              무엇이든 물어보기
            </div>
            <div className="text-[13px] leading-[1.55] text-ai-text">
              “관양동에서 9억 예산이면 어디부터 볼까?”
            </div>
            <div className="rounded-[10px] bg-[rgba(255,255,255,.08)] px-3 py-[9px] text-xs text-ai-muted">
              질문 입력… <span className="text-ai-accent">↵</span>
            </div>
          </div>
        </div>

        {/* 최근 분석 바로가기 */}
        <div className="rise-in-2 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="chip chip-soft px-3.5 py-2 text-xs no-underline"
            >
              {q.label} ›
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
