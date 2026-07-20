import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { ExampleBadge } from "../components/ExampleBadge";
import { safeAuth } from "@/lib/safe-auth";
import { listNotes } from "@/lib/inspection/store-db";
import { AiNoteAnalysisCard } from "./ai-note-analysis";

/* P1-10·P1-12: 가짜 개인화 foot 문구 제거(정적 설명으로 교체),
   실연동 전 도구에는 "시뮬레이션" 칩을 붙여 오해 방지 */
const TOOLS = [
  {
    href: "/notes",
    icon: "📝",
    title: "임장노트 분석",
    desc: "기록을 점수화하고 장단점·체크 제안을 정리",
    foot: "내 노트에서 분석 시작 ›",
    sim: false,
  },
  {
    href: "/analysis/compare",
    icon: "⚖️",
    title: "후보 단지 비교",
    desc: "같은 기준으로 항목·재무를 나란히 비교",
    foot: "비교 트레이 열기 ›",
    sim: false,
  },
  {
    href: "/analysis/scenario",
    icon: "📊",
    title: "시장·대출 시나리오",
    desc: "금리·시세 변동 시나리오별 원리금 스트레스 테스트",
    foot: "예시 시나리오 살펴보기 ›",
    sim: true,
  },
  {
    href: "/analysis/timing",
    icon: "⏱",
    title: "시세·타이밍 분석",
    desc: "지역 사이클 위치와 매수 적기 신호를 판단",
    foot: "예시 리포트 살펴보기 ›",
    sim: true,
  },
  {
    href: "/analysis/portfolio",
    icon: "💼",
    title: "포트폴리오 분석",
    desc: "보유·후보 자산의 구성과 갈아타기 시뮬레이션",
    foot: "예시 리포트 살펴보기 ›",
    sim: true,
  },
] as const;

const QUICK = [
  { href: "/analysis/cycle", label: "시세 사이클 (시뮬레이션)" },
  { href: "/analysis/price", label: "AI 제안가 근거 (시뮬레이션)" },
  { href: "/analysis/switch", label: "갈아타기 추천 (시뮬레이션)" },
] as const;

export const dynamic = "force-dynamic";

export default async function AnalysisHubPage({
  searchParams,
}: {
  searchParams: Promise<{ noteId?: string }>;
}) {
  const { noteId } = await searchParams;

  // 로그인 시 실데이터(내 노트 수)로 시작 섹션 구성 — 허위 수치 없음
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  let myNoteCount: number | null = null;
  if (email) {
    try {
      myNoteCount = (await listNotes(email)).length;
    } catch {
      myNoteCount = null; // 집계 실패 시 수치 미표기 (가짜 숫자 금지)
    }
  }

  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div className="rise-in px-1">
          <div className="text-[26px] font-extrabold text-ink">AI 분석 도구</div>
          <div className="mt-1.5 text-sm text-text-2">
            내 노트와 실거래 데이터가 연결된 5가지 분석
          </div>
        </div>

        {/* 시작 섹션 — 로그인: 실 카운트 + CTA / 비로그인: 예시 분석 1건 + 로그인 CTA */}
        {email ? (
          <div className="rise-in-1 card flex flex-col gap-3 rounded-[20px] p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[15px] font-extrabold text-ink">
                {myNoteCount !== null
                  ? myNoteCount > 0
                    ? `내 노트 ${myNoteCount}건이 분석을 기다려요`
                    : "아직 작성한 임장노트가 없어요"
                  : "내 노트로 바로 분석할 수 있어요"}
              </div>
              <div className="mt-1 text-[12px] text-text-3">
                {myNoteCount === 0
                  ? "첫 임장노트를 남기면 AI 분석이 열려요"
                  : "기록을 점수화하고 강점·약점·체크 제안을 정리해 드려요"}
              </div>
            </div>
            {myNoteCount === 0 ? (
              <Link href="/notes/new" className="btn-primary btn-md shrink-0">
                첫 노트 쓰기
              </Link>
            ) : (
              <a href="#ai-note-analysis" className="btn-primary btn-md shrink-0">
                내 노트로 분석 시작
              </a>
            )}
          </div>
        ) : (
          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-[20px] p-5">
            {/* 더미 1개 원칙: 비로그인 샘플 분석 카드는 1건 — 예시 배지 명시 */}
            <div className="flex items-center gap-1.5 text-[15px] font-extrabold text-ink">
              샘플 분석 리포트 <ExampleBadge />
            </div>
            <div className="ai-panel flex flex-col gap-1.5 rounded-[14px] p-3.5">
              <div className="text-xs font-extrabold text-white">
                공작아파트 3차 방문 — 채광·학군 강점, 주차는 구조적 약점
              </div>
              <div className="text-[11px] leading-[1.55] text-ai-text">
                · 채광·학군은 방문 기록에서 일관되게 강점으로 나타났어요
              </div>
              <div className="text-[11px] leading-[1.55] text-ai-text">
                · 주차는 시간대와 무관한 감점 요인 — 저녁 재방문을 제안해요
              </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <span className="text-[12px] text-text-3">
                로그인하면 내 임장노트 기준으로 똑같이 분석해 드려요
              </span>
              <Link href="/login" className="btn-primary btn-md shrink-0">
                로그인하고 분석 시작
              </Link>
            </div>
          </div>
        )}

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
              <div className="flex items-center gap-1.5 text-base font-extrabold text-ink">
                {t.title}
                {t.sim && (
                  <span className="inline-flex shrink-0 items-center rounded border border-line px-1 py-px text-[9px] font-semibold leading-[1.4] text-text-3">
                    시뮬레이션
                  </span>
                )}
              </div>
              <div className="text-[13px] leading-[1.55] text-text-2">
                {t.desc}
              </div>
              <div className="text-xs font-bold text-primary">{t.foot}</div>
            </Link>
          ))}

          {/* AI 노트 분석 — POST /api/ai/analysis 실연동 카드 (?noteId= 컨텍스트 수신) */}
          <div id="ai-note-analysis" className="h-full scroll-mt-24">
            <AiNoteAnalysisCard noteId={noteId ?? null} />
          </div>

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
