import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";

/* 시안 6c(노트 상세 + AI) + 10f(AI 노트 분석 — 점수 산출·편향 감지) */

const SEGMENTS = [
  { label: "채광", value: "좋음", tone: "text-primary" },
  { label: "소음", value: "보통", tone: "text-text-2" },
  { label: "주차", value: "아쉬움", tone: "text-danger" },
  { label: "학군", value: "좋음", tone: "text-primary" },
];

const VISITS = [
  { label: "1차 · 2026.05.02 (오전)", summary: "채광 보통 · 소음 좋음", latest: false },
  { label: "2차 · 2026.06.14 (저녁)", summary: "주차 아쉬움 · 소음 보통", latest: false },
  { label: "3차 · 2026.07.12 (오후)", summary: "채광 좋음 · 학군 좋음", latest: true },
];

const SCORE_BARS = [
  { label: "입지", value: 86, bad: false },
  { label: "환경", value: 78, bad: false },
  { label: "단지", value: 62, bad: true },
  { label: "가격", value: 84, bad: false },
  { label: "미래가치", value: 80, bad: false },
];

const SUGGESTIONS = [
  "평일 오전 등교 시간대 단지 앞 교통 확인",
  "302동 저층 채광 — 겨울 기준 재확인 필요",
  "관리비 내역(1988년 준공, 배관 이슈) 문의",
];

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;

  return (
    <PageShell breadcrumb="내 임장노트 › 공작아파트">
      {/* 상단 액션 */}
      <div className="rise-in mb-4 flex items-center justify-end gap-2">
        <button type="button" className="btn-soft px-3.5 py-2 text-[13px]">
          공유 링크
        </button>
        <Link href="/notes/compare" className="btn-secondary px-3.5 py-2 text-[13px]">
          회차 비교
        </Link>
        <Link href="/map" className="btn-primary btn-cta px-3.5 py-2 text-[13px]">
          지도에서 비교
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]">
        {/* ===== 좌측: 노트 본문 ===== */}
        <div className="flex flex-col gap-4">
          {/* 노트 카드 */}
          <div className="rise-in card flex flex-col gap-3.5 rounded-[20px] p-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-[22px] font-extrabold text-ink">
                  공작아파트 302동 84A
                </h1>
                <div className="mt-1 text-[13px] text-text-3">
                  2026.07.12 임장 · 3번째 방문 · 안양 관양동
                </div>
              </div>
              <span className="rounded-lg bg-primary-soft px-2.5 py-[5px] text-xs font-bold text-primary">
                비공개
              </span>
            </div>

            {/* 세그먼트 평가 요약 */}
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {SEGMENTS.map((s) => (
                <div key={s.label} className="rounded-xl bg-bg px-3.5 py-3 text-center">
                  <div className="text-xs text-text-3">{s.label}</div>
                  <div className={`mt-0.5 text-[15px] font-extrabold ${s.tone}`}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm leading-[1.7] text-text-1">
              남향이라 오후 채광 좋음. 단지 뒤 도로 소음 약간 있음. 초등학교 도보
              5분. 주차는 세대당 0.9대로 저녁엔 이중주차 많음.
            </p>

            {/* 현장 사진 플레이스홀더 */}
            <div className="flex gap-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex h-[78px] w-[110px] items-center justify-center rounded-[10px] bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef] font-mono text-[10px] text-text-3"
                >
                  현장 사진
                </div>
              ))}
              <div className="flex h-[78px] w-[110px] items-center justify-center rounded-[10px] bg-[#f2f4f8] text-xs font-bold text-text-2">
                +2
              </div>
            </div>
          </div>

          {/* 방문 기록 비교 */}
          <div className="rise-in-1 card flex flex-col gap-3 rounded-[20px] p-6">
            <div className="flex items-center justify-between">
              <div className="text-base font-extrabold text-ink">방문 기록 비교</div>
              <Link href="/notes/compare" className="text-xs font-bold text-primary">
                회차 전체 비교 ›
              </Link>
            </div>
            <div className="flex flex-col">
              {VISITS.map((v, i) => (
                <div
                  key={v.label}
                  className={`flex justify-between py-2.5 text-[13px] ${
                    i < VISITS.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <span className={v.latest ? "font-bold text-primary" : "text-text-2"}>
                    {v.label}
                  </span>
                  <span className={`font-bold ${v.latest ? "text-primary" : "text-text-1"}`}>
                    {v.summary}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 강점 · 약점 요약 (10f) */}
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[20px] p-6">
            <div className="text-[15px] font-extrabold text-ink">
              강점 · 약점 요약{" "}
              <span className="text-[11px] font-medium text-text-3">
                기록 5건 + 실거래 36건 + 공개 노트 38건
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <div className="flex flex-col gap-1.5 rounded-xl bg-[rgba(29,79,216,.05)] px-4 py-3">
                <div className="text-xs font-extrabold text-primary">확정 강점</div>
                <div className="text-xs leading-[1.6] text-text-1">
                  · 학군 (초 5분, 5회 일관)
                  <br />· 배수 (우천 확인)
                  <br />· 가격 (적정가 -3.7% 급매 존재)
                  <br />· 재건축 여지 + 재개발 인접
                </div>
              </div>
              <div className="flex flex-col gap-1.5 rounded-xl bg-danger-soft px-4 py-3">
                <div className="text-xs font-extrabold text-danger">확정 약점</div>
                <div className="text-xs leading-[1.6] text-text-1">
                  · 주차 0.9대 (월 외부주차 8만 환산)
                  <br />· 연식 38년 (관리비 +4만/월)
                  <br />· 오전 채광 보통 (재택근무 감점)
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-bg px-3.5 py-3">
              <span className="text-xs text-text-2">다음 단계 제안</span>
              <span className="text-xs font-extrabold text-primary">
                추가 방문 불필요 → 협상 단계 진행 ›
              </span>
            </div>
          </div>
        </div>

        {/* ===== 우측: AI 분석 ===== */}
        <aside className="flex flex-col gap-4">
          {/* AI 판단 근거 정리 (6c) */}
          <div className="rise-in-1">
            <AIPanel title="판단 근거 정리">
              <p className="text-[13px] leading-[1.7]">
                3회 방문 기록 기준 — 채광·학군은 일관되게 강점입니다. 소음은
                시간대 편차가 있고, 주차(세대당 0.9대)는 구조적 약점입니다.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between rounded-[10px] bg-[rgba(255,255,255,.07)] px-3 py-2.5">
                  <span className="text-xs">기록 종합 점수</span>
                  <span className="text-sm font-extrabold text-white">78 / 100</span>
                </div>
                <div className="flex items-center justify-between rounded-[10px] bg-[rgba(255,255,255,.07)] px-3 py-2.5">
                  <span className="text-xs">최근 3개월 실거래</span>
                  <span className="text-sm font-extrabold text-ai-accent">
                    ▼ 4.1% 하락 구간
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-[10px] bg-[rgba(255,255,255,.07)] px-3 py-2.5">
                  <span className="text-xs">예산 내 대안 단지</span>
                  <span className="text-sm font-extrabold text-white">2곳</span>
                </div>
              </div>
              <Link
                href="/analysis/compare"
                className="btn-primary mt-3 block rounded-xl p-3 text-center text-sm text-white"
                style={{ boxShadow: "0 8px 20px rgba(29,79,216,.4)" }}
              >
                대안 단지와 나란히 비교
              </Link>
            </AIPanel>
          </div>

          {/* AI 점수 산출 (10f) */}
          <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[20px] p-6">
            <div
              className="relative h-[110px] w-[110px] rounded-full"
              style={{
                background:
                  "conic-gradient(#1d4fd8 0% 81%, rgba(29,79,216,.12) 81% 100%)",
              }}
            >
              <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-surface">
                <span className="text-[30px] font-extrabold leading-none text-primary">
                  81
                </span>
                <span className="text-[10px] text-text-3">/ 100</span>
              </div>
            </div>
            <div className="text-center text-xs text-text-2">
              관양동 공개 노트 상위 <b className="text-primary">12%</b> · 기록
              완성도 높음
            </div>
            <div className="flex w-full flex-col gap-[7px]">
              {SCORE_BARS.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="w-11 shrink-0 text-[11px] text-text-2">
                    {b.label}
                  </span>
                  <div className="relative h-2 flex-1 rounded bg-[#eef1f6]">
                    <div
                      className={`absolute left-0 h-2 rounded ${
                        b.bad ? "bg-danger" : "bg-primary"
                      }`}
                      style={{ width: `${b.value}%` }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-extrabold ${
                      b.bad ? "text-danger" : "text-ink"
                    }`}
                  >
                    {b.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-[#adb5bd]">
              점수 = 내 기록 60% + 공공 데이터 40% 가중
            </div>
          </div>

          {/* 기록 완성도 (10f) */}
          <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">기록 완성도</div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">체크 항목</span>
              <span className="font-extrabold text-primary">9/10 완료</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">시간대 커버리지</span>
              <span className="font-extrabold text-primary">
                오전·오후·저녁·우천 ✓
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">미확인 항목</span>
              <span className="font-extrabold text-danger">겨울 채광 1건</span>
            </div>
          </div>

          {/* AI 판단 편향 감지 (10f) */}
          <div className="rise-in-4">
            <AIPanel title="판단 편향 감지">
              <p>
                기록 5건 중 4건이{" "}
                <b className="text-[#f2c94c]">긍정 표현 위주</b>입니다 — 이미
                마음이 기운 상태에서의 확증 편향 가능성이 있어요. 균형을 위해: ①
                이 단지의 <b className="text-white">부정 공개 노트 3건</b>을
                읽어보세요 ② 체크 항목 중 &apos;아쉬움&apos;이 2개 이상인
                항목(주차·연식)에 실제 월 비용을 붙여 다시 평가해 보세요.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1 rounded-[10px] p-2.5 text-center text-xs text-white"
                >
                  반대 관점 노트 3건 보기
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-[10px] bg-[rgba(255,255,255,.08)] p-2.5 text-center text-xs font-bold text-ai-text"
                >
                  약점 비용 환산
                </button>
              </div>
            </AIPanel>
          </div>

          {/* 체크 제안 (6c) */}
          <div className="rise-in-5 card flex flex-col gap-2.5 rounded-[20px] p-5">
            <div className="text-sm font-extrabold text-ink">체크 제안</div>
            {SUGGESTIONS.map((s) => (
              <div
                key={s}
                className="flex items-baseline gap-2 text-[13px] leading-[1.5] text-text-1"
              >
                <span className="font-extrabold text-primary">·</span>
                {s}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
