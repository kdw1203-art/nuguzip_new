import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";

/* 시안 9e — 노트 다회차 비교 (1~5차 + 추이) */

type CellTone = "good" | "avg" | "bad" | "none";

const TONE_CLASS: Record<CellTone, string> = {
  good: "font-extrabold text-primary",
  avg: "font-bold text-text-2",
  bad: "font-extrabold text-danger",
  none: "text-text-3",
};

const HEADERS = [
  { n: "1차", meta: "05.02 · 평일 오전", latest: false },
  { n: "2차", meta: "06.14 · 평일 저녁", latest: false },
  { n: "3차", meta: "07.12 · 주말 오후", latest: false },
  { n: "4차", meta: "07.15 · 평일 오후", latest: false },
  { n: "5차 (최신)", meta: "07.18 · 비 오는 날", latest: true },
];

const ROWS: { label: string; cells: { text: string; tone: CellTone }[] }[] = [
  {
    label: "채광",
    cells: [
      { text: "보통", tone: "avg" },
      { text: "—", tone: "none" },
      { text: "좋음", tone: "good" },
      { text: "좋음", tone: "good" },
      { text: "보통", tone: "avg" },
    ],
  },
  {
    label: "소음",
    cells: [
      { text: "좋음", tone: "good" },
      { text: "보통", tone: "avg" },
      { text: "보통", tone: "avg" },
      { text: "보통", tone: "avg" },
      { text: "좋음", tone: "good" },
    ],
  },
  {
    label: "주차",
    cells: [
      { text: "—", tone: "none" },
      { text: "아쉬움", tone: "bad" },
      { text: "아쉬움", tone: "bad" },
      { text: "보통", tone: "avg" },
      { text: "아쉬움", tone: "bad" },
    ],
  },
  {
    label: "배수/침수",
    cells: [
      { text: "—", tone: "none" },
      { text: "—", tone: "none" },
      { text: "—", tone: "none" },
      { text: "—", tone: "none" },
      { text: "양호", tone: "good" },
    ],
  },
  {
    label: "교통 체감",
    cells: [
      { text: "보통", tone: "avg" },
      { text: "혼잡", tone: "bad" },
      { text: "좋음", tone: "good" },
      { text: "보통", tone: "avg" },
      { text: "보통", tone: "avg" },
    ],
  },
  {
    label: "환기·냄새",
    cells: [
      { text: "—", tone: "none" },
      { text: "—", tone: "none" },
      { text: "보통", tone: "avg" },
      { text: "보통", tone: "avg" },
      { text: "좋음", tone: "good" },
    ],
  },
  {
    label: "관리 상태",
    cells: [
      { text: "보통", tone: "avg" },
      { text: "—", tone: "none" },
      { text: "보통", tone: "avg" },
      { text: "좋음", tone: "good" },
      { text: "좋음", tone: "good" },
    ],
  },
  {
    label: "주민 분위기",
    cells: [
      { text: "—", tone: "none" },
      { text: "좋음", tone: "good" },
      { text: "좋음", tone: "good" },
      { text: "—", tone: "none" },
      { text: "좋음", tone: "good" },
    ],
  },
];

const SCORES = [
  { value: 68, cls: "text-text-2" },
  { value: 70, cls: "text-text-2" },
  { value: 78, cls: "text-text-1" },
  { value: 80, cls: "text-text-1" },
  { value: 81, cls: "text-primary" },
];

const TREND_LABELS = [
  { left: "10%", top: 36, value: "68", cls: "text-[10px] font-bold text-text-3" },
  { left: "30%", top: 29, value: "70", cls: "text-[10px] font-bold text-text-3" },
  { left: "50%", top: 10, value: "78", cls: "text-[10px] font-bold text-text-2" },
  { left: "70%", top: 5, value: "80", cls: "text-[10px] font-bold text-text-2" },
  { left: "90%", top: 0, value: "81", cls: "text-[11px] font-extrabold text-primary" },
];

export default function NotesComparePage() {
  return (
    <PageShell breadcrumb="내 임장노트 › 공작 302동 › 회차 비교 (5회)">
      <div className="flex flex-col gap-3.5">
        {/* 헤더 + 회차 칩 */}
        <div className="rise-in flex flex-col gap-3 px-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold text-ink">
              노트 다회차 비교
            </h1>
            <p className="mt-1.5 text-sm text-text-2">
              1~5차 방문 기록과 점수 추이를 한눈에
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {["1차", "2차", "3차", "4차", "5차"].map((c) => (
              <span key={c} className="chip chip-soft px-3 py-1.5">
                {c} ✓
              </span>
            ))}
          </div>
        </div>

        {/* 회차 비교 테이블 */}
        <div className="rise-in-1 card overflow-x-auto rounded-[20px] px-[22px] py-5">
          <div className="min-w-[720px]">
            {/* 헤더 행 */}
            <div className="grid grid-cols-[90px_repeat(5,1fr)] items-end gap-2 border-b border-[#f0f3f8] pb-2.5 pt-2 text-[11px] text-text-3">
              <span />
              {HEADERS.map((h) => (
                <div
                  key={h.n}
                  className={`text-center ${
                    h.latest ? "rounded-lg bg-[rgba(29,79,216,.05)] p-0.5" : ""
                  }`}
                >
                  <b className={h.latest ? "text-primary" : "text-text-1"}>{h.n}</b>
                  <br />
                  {h.meta}
                </div>
              ))}
            </div>
            {/* 항목 행 */}
            {ROWS.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[90px_repeat(5,1fr)] items-center gap-2 border-b border-[#f0f3f8] py-[9px] text-xs"
              >
                <span className="text-text-2">{row.label}</span>
                {row.cells.map((c, i) => (
                  <span key={i} className={`text-center ${TONE_CLASS[c.tone]}`}>
                    {c.text}
                  </span>
                ))}
              </div>
            ))}
            {/* 종합 점수 행 */}
            <div className="grid grid-cols-[90px_repeat(5,1fr)] items-center gap-2 py-[9px] text-xs">
              <span className="text-text-2">종합 점수</span>
              {SCORES.map((s) => (
                <span key={s.value} className={`text-center font-extrabold ${s.cls}`}>
                  {s.value}
                </span>
              ))}
            </div>

            {/* 점수 추이 차트 */}
            <div className="relative mt-3.5">
              <svg
                width="100%"
                height="88"
                viewBox="0 0 1000 88"
                preserveAspectRatio="none"
                className="block"
                role="img"
                aria-label="점수 추이 68에서 81"
              >
                <defs>
                  <linearGradient id="noteTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4fd8" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#1d4fd8" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M100,54 C170,53 230,50 300,47 C380,43 430,32 500,28 C570,24 640,23.5 700,23 C770,22.4 840,21.4 900,21 L900,88 L100,88 Z"
                  fill="url(#noteTrend)"
                />
                <path
                  d="M100,54 C170,53 230,50 300,47 C380,43 430,32 500,28 C570,24 640,23.5 700,23 C770,22.4 840,21.4 900,21"
                  fill="none"
                  stroke="#1d4fd8"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="100" cy="54" r="4" fill="#fff" stroke="#a9bde8" strokeWidth="2.5" />
                <circle cx="300" cy="47" r="4" fill="#fff" stroke="#a9bde8" strokeWidth="2.5" />
                <circle cx="500" cy="28" r="4" fill="#fff" stroke="#7ea2ff" strokeWidth="2.5" />
                <circle cx="700" cy="23" r="4" fill="#fff" stroke="#7ea2ff" strokeWidth="2.5" />
                <circle cx="900" cy="21" r="5.5" fill="#1d4fd8" stroke="#fff" strokeWidth="2.5" />
              </svg>
              {TREND_LABELS.map((l) => (
                <div
                  key={l.left}
                  className={`absolute -translate-x-1/2 ${l.cls}`}
                  style={{ left: l.left, top: l.top }}
                >
                  {l.value}
                </div>
              ))}
              <div className="relative mt-0.5 h-3.5">
                {["1차", "2차", "3차", "4차", "5차"].map((c, i) => (
                  <span
                    key={c}
                    className="absolute -translate-x-1/2 text-[10px] text-[#adb5bd]"
                    style={{ left: `${10 + i * 20}%` }}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-[#adb5bd]">
                점수 추이 68 → 81 · 방문할수록 확신 상승
              </div>
            </div>
          </div>
        </div>

        {/* AI 종합 판단 */}
        <div className="rise-in-2">
          <AIPanel title="다회차 종합 판단">
            5회 방문으로 시간대·날씨 변수가 모두 확인됐습니다.{" "}
            <b className="text-ai-accent">
              확정 강점: 학군·배수 / 확정 약점: 주차
            </b>
            . 채광은 &apos;오후 좋음, 오전·흐린 날 보통&apos;으로 결론 —
            재택근무자라면 감점 요인입니다. 추가 방문보다{" "}
            <b className="text-white">가격 협상 단계로 진행</b>을 권장합니다.
          </AIPanel>
        </div>

        {/* 노트 상세로 돌아가기 */}
        <div className="rise-in-3 flex justify-end">
          <Link href="/notes/1" className="btn-secondary px-4 py-2 text-[13px]">
            ‹ 노트 상세로
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
