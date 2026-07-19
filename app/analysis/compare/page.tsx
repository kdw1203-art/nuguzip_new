"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
import {
  COMPARE_TRAY_MAX,
  listCompareTray,
  removeFromCompareTray,
  subscribeCompareTray,
  type CompareTrayItem,
} from "@/lib/newui/compare-tray";

/* ---------- 내가 담은 후보 (localStorage 비교 트레이) ---------- */

function CompareTraySection() {
  const [items, setItems] = useState<CompareTrayItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(listCompareTray());
    sync();
    return subscribeCompareTray(sync);
  }, []);

  return (
    <div className="rise-in card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
      <div className="text-[13px] font-extrabold text-ink">
        내가 담은 후보 {items.length}개
        <span className="ml-1 font-semibold text-text-3">
          / 최대 {COMPARE_TRAY_MAX}개
        </span>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item.id}
              className="chip chip-soft flex items-center gap-1.5 px-[11px] py-[5px] text-[11px]"
            >
              <Link href={`/complex/${encodeURIComponent(item.id)}`}>
                {item.name}
                {item.region ? ` · ${item.region}` : ""}
              </Link>
              <button
                type="button"
                aria-label={`${item.name} 비교에서 빼기`}
                onClick={() => setItems(removeFromCompareTray(item.id))}
                className="font-bold text-text-3"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-text-3">
          아직 담은 후보가 없어요 — 단지 화면의 &quot;비교 담기&quot;로 최대{" "}
          {COMPARE_TRAY_MAX}개까지 담을 수 있어요.
        </div>
      )}
    </div>
  );
}

/* ---------- 단지 비교 (9b) 데이터 ---------- */

type Tone = "blue" | "red" | "default" | "gray";

const toneClass: Record<Tone, string> = {
  blue: "text-primary",
  red: "text-danger",
  default: "text-text-1",
  gray: "text-text-3",
};

type Cell = { text: string; tone: Tone };

const COMPLEXES = [
  { name: "공작", crown: false, meta: "노트3 · 1988", price: "8.4억" },
  { name: "동편3 👑", crown: true, meta: "노트1 · 2012", price: "10.2억" },
  { name: "한가람", crown: false, meta: "노트1 · 1992", price: "7.9억" },
  { name: "인덕원대우", crown: false, meta: "노트0 · 1994", price: "8.1억" },
  { name: "평촌더샵", crown: false, meta: "노트0 · 2016", price: "11.8억" },
] as const;

const ROWS: { section?: string; label: string; cells: Cell[] }[] = [
  {
    label: "종합 점수",
    cells: [
      { text: "78", tone: "default" },
      { text: "82", tone: "blue" },
      { text: "64", tone: "gray" },
      { text: "71*", tone: "gray" },
      { text: "75*", tone: "gray" },
    ],
  },
  {
    section: "가격 · 시세",
    label: "3개월 시세",
    cells: [
      { text: "▼2.1%", tone: "blue" },
      { text: "▼1.4%", tone: "blue" },
      { text: "▲0.8%", tone: "red" },
      { text: "—", tone: "default" },
      { text: "▼0.9%", tone: "blue" },
    ],
  },
  {
    label: "호가 (최고–최저)",
    cells: [
      { text: "8.9–7.9억\n격차 1.0억", tone: "red" },
      { text: "10.6–10.1억\n격차 0.5억", tone: "blue" },
      { text: "8.3–7.7억\n격차 0.6억", tone: "default" },
      { text: "8.5–7.9억\n격차 0.6억", tone: "default" },
      { text: "12.4–11.5억\n격차 0.9억", tone: "default" },
    ],
  },
  {
    label: "평단가 (3.3㎡)",
    cells: [
      { text: "3,100만", tone: "blue" },
      { text: "3,770만", tone: "default" },
      { text: "2,920만", tone: "blue" },
      { text: "2,990만", tone: "default" },
      { text: "4,360만", tone: "red" },
    ],
  },
  {
    label: "전세가율",
    cells: [
      { text: "58%", tone: "default" },
      { text: "64%", tone: "blue" },
      { text: "61%", tone: "default" },
      { text: "60%", tone: "default" },
      { text: "52%", tone: "gray" },
    ],
  },
  {
    label: "월 원리금(40%)",
    cells: [
      { text: "164만", tone: "default" },
      { text: "199만", tone: "default" },
      { text: "154만", tone: "default" },
      { text: "158만", tone: "default" },
      { text: "231만", tone: "red" },
    ],
  },
  {
    label: "관리비 (84 월평균)",
    cells: [
      { text: "28만", tone: "red" },
      { text: "21만", tone: "blue" },
      { text: "26만", tone: "default" },
      { text: "25만", tone: "default" },
      { text: "24만", tone: "default" },
    ],
  },
  {
    section: "입지 · 접근성",
    label: "교통 (역 도보)",
    cells: [
      { text: "12분", tone: "default" },
      { text: "9분", tone: "default" },
      { text: "5분", tone: "blue" },
      { text: "4분", tone: "blue" },
      { text: "11분", tone: "default" },
    ],
  },
  {
    label: "학군 (도보)",
    cells: [
      { text: "초 5분", tone: "blue" },
      { text: "초 3분", tone: "blue" },
      { text: "초 12분", tone: "default" },
      { text: "초 8분", tone: "default" },
      { text: "초 4분", tone: "blue" },
    ],
  },
  {
    label: "학원가 접근성",
    cells: [
      { text: "평촌 차 8분", tone: "default" },
      { text: "평촌 도보 15분", tone: "blue" },
      { text: "차 10분", tone: "default" },
      { text: "차 12분", tone: "default" },
      { text: "평촌 도보 5분", tone: "blue" },
    ],
  },
  {
    label: "관공서 접근성",
    cells: [
      { text: "동안구청 8분", tone: "blue" },
      { text: "차 6분", tone: "default" },
      { text: "차 9분", tone: "default" },
      { text: "차 11분", tone: "default" },
      { text: "도보 10분", tone: "blue" },
    ],
  },
  {
    label: "공원 접근성",
    cells: [
      { text: "학의천 3분", tone: "blue" },
      { text: "단지 내 공원", tone: "blue" },
      { text: "도보 12분", tone: "default" },
      { text: "도보 9분", tone: "default" },
      { text: "중앙공원 5분", tone: "blue" },
    ],
  },
  {
    label: "병원·마트",
    cells: [
      { text: "이마트 차 5분", tone: "default" },
      { text: "홈플러스 7분", tone: "default" },
      { text: "차 6분", tone: "default" },
      { text: "종합병원 도보 9분", tone: "blue" },
      { text: "롯데백화점 5분", tone: "blue" },
    ],
  },
  {
    section: "단지 여건",
    label: "세대수",
    cells: [
      { text: "1,486", tone: "blue" },
      { text: "762", tone: "default" },
      { text: "918", tone: "default" },
      { text: "1,239", tone: "default" },
      { text: "890", tone: "default" },
    ],
  },
  {
    label: "노후도 (연식)",
    cells: [
      { text: "38년", tone: "red" },
      { text: "14년", tone: "blue" },
      { text: "34년", tone: "red" },
      { text: "32년", tone: "red" },
      { text: "10년", tone: "blue" },
    ],
  },
  {
    label: "주차 (세대당)",
    cells: [
      { text: "0.9대", tone: "red" },
      { text: "1.4대", tone: "blue" },
      { text: "1.0대", tone: "default" },
      { text: "1.1대", tone: "default" },
      { text: "1.6대", tone: "blue" },
    ],
  },
  {
    label: "재건축 여지",
    cells: [
      { text: "높음", tone: "blue" },
      { text: "해당 없음", tone: "gray" },
      { text: "중간", tone: "default" },
      { text: "중간", tone: "default" },
      { text: "해당 없음", tone: "gray" },
    ],
  },
  {
    label: "개발 호재",
    cells: [
      { text: "관양 재개발 인접\n인덕원선 (2028)", tone: "blue" },
      { text: "학교 신설 예정", tone: "default" },
      { text: "관양 재개발 인접", tone: "default" },
      { text: "인덕원선 역세권\n지식산업단지", tone: "blue" },
      { text: "특이사항 없음", tone: "gray" },
    ],
  },
  {
    section: "시장 · 커뮤니티",
    label: "실거래 (6개월)",
    cells: [
      { text: "36건", tone: "blue" },
      { text: "14건", tone: "default" },
      { text: "19건", tone: "default" },
      { text: "22건", tone: "default" },
      { text: "8건", tone: "gray" },
    ],
  },
  {
    label: "커뮤니티 관심도",
    cells: [
      { text: "노트 38 · 글 24", tone: "blue" },
      { text: "노트 12 · 글 9", tone: "default" },
      { text: "노트 9 · 글 6", tone: "default" },
      { text: "노트 7 · 글 11", tone: "default" },
      { text: "노트 4 · 글 2", tone: "gray" },
    ],
  },
];

const CHIPS = ["공작", "동편3", "한가람", "인덕원대우", "평촌더샵"];

/* ---------- 매물 비교 (8j) 데이터 ---------- */

const LISTINGS = [
  { badge: "급매", hot: true, name: "A · 7.9억", meta: "5층 · 올수리" },
  { badge: "일반", hot: false, name: "B · 8.4억", meta: "12층 · 기본" },
  { badge: "일반", hot: false, name: "C · 8.2억", meta: "9층 · 수리 필요" },
] as const;

const LISTING_ROWS: { label: string; cells: Cell[] }[] = [
  {
    label: "㎡당 가격",
    cells: [
      { text: "940만", tone: "blue" },
      { text: "1,000만", tone: "default" },
      { text: "976만", tone: "default" },
    ],
  },
  {
    label: "수리비 추정",
    cells: [
      { text: "0원", tone: "default" },
      { text: "~1,500만", tone: "default" },
      { text: "~4,000만", tone: "red" },
    ],
  },
  {
    label: "실질 가격*",
    cells: [
      { text: "7.9억", tone: "blue" },
      { text: "8.55억", tone: "default" },
      { text: "8.6억", tone: "default" },
    ],
  },
  {
    label: "최근 동일층 실거래",
    cells: [
      { text: "8.15억 (5층)", tone: "default" },
      { text: "8.40억 (12층)", tone: "default" },
      { text: "8.52억 (9층)", tone: "default" },
    ],
  },
];

const AI_SUGGEST = [
  { price: "7.75~7.9억", sub: "협상 여지 -1.9%", hot: true },
  { price: "8.1~8.25억", sub: "호가 -2.4% 제안", hot: false },
  { price: "7.7~7.85억", sub: "수리비 반영 -4.9%", hot: false },
] as const;

const hiCol = "rounded-lg bg-[rgba(29,79,216,.05)] py-1";

export default function ComparePage() {
  const [tab, setTab] = useState<"complex" | "listing">("complex");

  return (
    <PageShell breadcrumb="AI 분석 › 다자 비교 (5/5)">
      <div className="flex flex-col gap-3.5">
        {/* 내가 담은 후보 (비교 트레이) */}
        <CompareTraySection />

        {/* 탭 */}
        <div className="rise-in flex gap-1.5 text-xs">
          <button
            onClick={() => setTab("complex")}
            className={`chip px-3.5 py-[7px] ${
              tab === "complex" ? "chip-active" : "bg-[rgba(255,255,255,.7)] text-text-2"
            }`}
          >
            단지 비교
          </button>
          <button
            onClick={() => setTab("listing")}
            className={`chip px-3.5 py-[7px] ${
              tab === "listing" ? "chip-active" : "bg-[rgba(255,255,255,.7)] text-text-2"
            }`}
          >
            매물 비교
          </button>
        </div>

        {tab === "complex" ? (
          <>
            {/* 비교 표 */}
            <div className="rise-in-1 card overflow-x-auto rounded-[20px] px-[22px] py-5">
              <div className="min-w-[880px]">
                {/* 헤더 행 */}
                <div className="grid grid-cols-[110px_repeat(5,1fr)] items-end gap-2 border-b border-[#f0f3f8] pb-3 pt-2">
                  <span className="text-[11px] text-text-3">노트·시세 기준</span>
                  {COMPLEXES.map((c) => (
                    <div
                      key={c.name}
                      className={`text-center ${c.crown ? "rounded-[10px] bg-[rgba(29,79,216,.05)] py-1" : ""}`}
                    >
                      <div className={`text-[13px] font-extrabold ${c.crown ? "text-primary" : "text-ink"}`}>
                        {c.name}
                      </div>
                      <div className="text-[10px] text-text-3">{c.meta}</div>
                      <div className="mt-0.5 text-sm font-extrabold text-ink">{c.price}</div>
                    </div>
                  ))}
                </div>
                {/* 항목 행 */}
                {ROWS.map((row) => (
                  <div key={row.label}>
                    {row.section && (
                      <div className="pb-0.5 pt-3 text-[10px] font-extrabold tracking-[1px] text-[#adb5bd]">
                        {row.section}
                      </div>
                    )}
                    <div className="grid grid-cols-[110px_repeat(5,1fr)] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs">
                      <span className="text-text-2">{row.label}</span>
                      {row.cells.map((cell, i) => (
                        <span
                          key={i}
                          className={`whitespace-pre-line text-center font-bold leading-[1.4] ${toneClass[cell.tone]} ${
                            i === 1 ? hiCol : ""
                          }`}
                        >
                          {cell.text}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI 총평 + 담은 단지 */}
            <div className="rise-in-2 flex flex-col gap-3.5 lg:flex-row">
              <div className="ai-panel flex flex-[1.6] items-start gap-3 rounded-2xl p-[18px]">
                <span className="ai-chip h-[22px] w-[22px] rounded-[7px] text-[11px]">AI</span>
                <div className="text-xs leading-[1.65] text-ai-text">
                  *노트 없는 단지는 공공 데이터 추정 점수. 실거주 1위{" "}
                  <b className="text-ai-accent">동편3</b>(신축·주차·학원가), 예산 효율 1위{" "}
                  <b className="text-white">공작</b>, 장기 상승 여력 1위{" "}
                  <b className="text-white">공작(재개발 인접 + 인덕원선)</b>. 인덕원대우는
                  호재(역세권·지산) 대비 저평가 — 노트 1회를 남기면 비교 정확도가 올라갑니다.
                  공작은 노후 38년으로 관리비(월 28만)와 배관 이슈를 반드시 확인하세요.
                </div>
              </div>
              <div className="card flex flex-1 flex-col justify-center gap-2 rounded-2xl px-[18px] py-4">
                <div className="flex flex-wrap gap-1.5">
                  {CHIPS.map((c) => (
                    <span key={c} className="chip chip-soft px-[11px] py-[5px] text-[11px]">
                      {c} ✕
                    </span>
                  ))}
                </div>
                <div className="text-[11px] text-text-3">
                  지도·검색·내 노트에서 단지를 담아 최대 5개 비교
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 매물 비교 표 (8j) */}
            <div className="rise-in-1 card overflow-x-auto rounded-[20px] p-[22px]">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[120px_repeat(3,1fr)] items-end gap-2.5 border-b border-[#f0f3f8] py-2.5 text-xs text-text-3">
                  <span />
                  {LISTINGS.map((l) => (
                    <div key={l.name} className="text-center">
                      <span
                        className={`rounded px-[7px] py-0.5 text-[10px] font-extrabold ${
                          l.hot ? "bg-danger-soft text-danger" : "bg-[#f2f4f8] font-bold text-text-2"
                        }`}
                      >
                        {l.badge}
                      </span>
                      <div className="mt-1 text-sm font-extrabold text-ink">{l.name}</div>
                      <div className="text-[10px]">{l.meta}</div>
                    </div>
                  ))}
                </div>
                {LISTING_ROWS.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[120px_repeat(3,1fr)] items-center gap-2.5 border-b border-[#f0f3f8] py-2.5 text-[13px]"
                  >
                    <span className="text-text-2">{row.label}</span>
                    {row.cells.map((cell, i) => (
                      <span key={i} className={`text-center font-bold ${toneClass[cell.tone]}`}>
                        {cell.text}
                      </span>
                    ))}
                  </div>
                ))}
                {/* AI 제안가 행 */}
                <div className="mt-1 grid grid-cols-[120px_repeat(3,1fr)] items-center gap-2.5 rounded-[10px] bg-[rgba(29,79,216,.04)] py-3 text-[13px]">
                  <Link href="/analysis/price" className="pl-2 font-extrabold text-primary no-underline">
                    AI 제안가 ›
                  </Link>
                  {AI_SUGGEST.map((s) => (
                    <span
                      key={s.price}
                      className={`text-center font-extrabold ${s.hot ? "text-primary" : "text-text-1"}`}
                    >
                      {s.price}
                      <span
                        className={`block text-[10px] font-semibold ${
                          s.hot ? "text-[#5b74b8]" : "text-text-3"
                        }`}
                      >
                        {s.sub}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* AI 총평 + 예산 체크 */}
            <div className="rise-in-2 flex flex-col gap-3.5 lg:flex-row">
              <div className="ai-panel flex flex-[1.6] items-start gap-3 rounded-2xl p-[18px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
                <span className="ai-chip h-[22px] w-[22px] rounded-[7px] text-[11px]">AI</span>
                <div className="text-xs leading-[1.65] text-ai-text">
                  *실질 가격 = 호가 + 수리비 추정. <b className="text-ai-accent">A(급매)가 실질 기준 최저</b>
                  이며 동일층 실거래보다 3% 낮습니다. 매도인이 이사 일정이 급한 매물로 확인되면
                  7.75억까지 협상 가능권. C는 수리비 반영 시 실질 가격이 가장 높아 제외를 권장합니다.
                </div>
              </div>
              <div className="card flex flex-1 flex-col gap-2 rounded-2xl p-[18px]">
                <div className="text-[13px] font-extrabold text-ink">내 예산 체크</div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-2">A 선택 시 월 원리금</span>
                  <span className="font-extrabold text-primary">154만 (26%)</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-2">B 선택 시 월 원리금</span>
                  <span className="font-extrabold text-text-1">164만 (28%)</span>
                </div>
                <Link
                  href="/analysis/scenario"
                  className="btn-soft mt-1 rounded-[10px] p-2.5 text-center text-xs no-underline"
                >
                  A 매물로 시나리오 실행
                </Link>
              </div>
            </div>
          </>
        )}

        {/* 15h-44 분석→행동: 결과 끝 다음 행동 카드 */}
        <NextActions
          actions={[
            { label: "노트 쓰러 가기", href: "/notes/new", primary: true },
            { label: "계산기로 월 부담 확인", href: "/calculator" },
            { label: "알림 설정", href: "/notifications" },
          ]}
        />
      </div>
    </PageShell>
  );
}
