import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { AIPanel } from "../components/AIPanel";
import { SearchClient } from "./search-client";
import { RecentComplexChips } from "../components/RecentComplexes";

/* ============================================================
   통합 검색 (11c) — 클라이언트 검색 입력 + 단지 자동완성(#48)
   입력 전에는 기존 “공작” 검색 목업 결과 섹션 유지
   ============================================================ */

const COUNT_TABS = [
  { label: "전체 52", active: true },
  { label: "단지 3", active: false },
  { label: "노트 38", active: false },
  { label: "글 8", active: false },
  { label: "전문가 3", active: false },
] as const;

const PUBLIC_NOTES = [
  {
    title: "302동 — “주차가 관건, 저녁 실측”",
    author: "첫집준비중",
    verified: true,
    date: "07.12",
    score: "78점",
  },
  {
    title: "105동 — “겨울 채광 확인함”",
    author: "관양토박이",
    verified: false,
    date: "07.15",
    score: "81점",
  },
] as const;

const RECENT_KEYWORDS = ["관양동", "동편마을", "과천 S7 청약", "인덕원선"] as const;

function Highlight() {
  return <b className="text-primary">공작</b>;
}

export default function SearchPage() {
  return (
    <PageShell>
      {/* 클라이언트 검색 입력 + 자동완성 드롭다운(#48) — 입력 전에는 아래 목업 결과 유지 */}
      <SearchClient>
      {/* 최근 본 단지 칩 — localStorage 기록 있을 때만 노출 */}
      <RecentComplexChips className="mb-4" />

      {/* 카운트 칩 */}
      <div className="rise-in flex flex-wrap gap-1.5 text-xs">
        {COUNT_TABS.map((t) => (
          <span
            key={t.label}
            className={`chip px-3.5 py-[7px] ${
              t.active
                ? "chip-active"
                : "border border-[#e2e7ee] bg-surface text-text-2"
            }`}
          >
            {t.label}
          </span>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        {/* ===== 좌측 결과 컬럼 ===== */}
        <div className="flex flex-col gap-3">
          <div className="rise-in-1 px-1 text-xs font-extrabold text-text-3">단지</div>
          <div className="rise-in-1 card flex flex-col gap-3 rounded-2xl px-[18px] py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-extrabold text-ink">
                  공작아파트 <Highlight />
                </span>
                <span className="rounded bg-primary-soft px-1.5 py-px text-[9px] font-extrabold text-primary">
                  내 노트 3
                </span>
                <span className="rounded bg-danger-soft px-1.5 py-px text-[9px] font-extrabold text-danger">
                  급매 1
                </span>
              </div>
              <div className="mt-[3px] text-xs text-text-3">
                안양 관양동 · 1988 · 1,486세대 · 84㎡ 8.4억 ▼2.1%
              </div>
            </div>
            <div className="flex gap-1.5">
              <Link
                href="/map"
                className="btn-soft rounded-[9px] px-[13px] py-2 text-[11px]"
              >
                지도
              </Link>
              <Link
                href="/complex/mock-1"
                className="btn-primary rounded-[9px] px-[13px] py-2 text-[11px]"
              >
                단지 홈
              </Link>
            </div>
          </div>

          <div className="rise-in-2 px-1 pt-1.5 text-xs font-extrabold text-text-3">
            공개 노트 38 · 점수순
          </div>
          {PUBLIC_NOTES.map((n) => (
            <div
              key={n.title}
              className="rise-in-2 card flex items-center justify-between rounded-2xl px-[18px] py-3.5"
            >
              <div>
                <div className="text-[13px] font-bold text-ink">
                  <Highlight /> {n.title}
                </div>
                <div className="mt-0.5 text-[11px] text-text-3">
                  {n.author}{" "}
                  {n.verified && (
                    <span className="rounded-full bg-ink px-[5px] py-px text-[8px] font-extrabold text-ai-accent">
                      ✦
                    </span>
                  )}{" "}
                  · {n.date}
                </div>
              </div>
              <span className="text-xs font-extrabold text-primary">{n.score}</span>
            </div>
          ))}

          <div className="rise-in-3 px-1 pt-1.5 text-xs font-extrabold text-text-3">
            동네이야기 8
          </div>
          <div className="rise-in-3 card rounded-2xl px-[18px] py-3.5">
            <div className="text-[13px] font-bold text-ink">
              <Highlight /> 재건축 추진위 실체가 있나요?
            </div>
            <div className="mt-0.5 text-[11px] text-text-3">
              질문 · 댓글 9 · 김OO 중개사 채택 답변
            </div>
          </div>
        </div>

        {/* ===== 우측 컬럼 ===== */}
        <aside className="flex flex-col gap-3.5">
          <div className="rise-in-2 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">전문가 3</div>
            <div className="flex items-center justify-between border-b border-[#f0f3f8] py-[7px] text-xs">
              <div>
                <div className="font-bold text-ink">
                  김OO 중개사{" "}
                  <span className="rounded bg-primary-soft px-[5px] py-px text-[9px] font-extrabold text-primary">
                    인증
                  </span>
                </div>
                <div className="text-[10px] text-text-3">
                  <Highlight /> 관련 답변 24 · ★4.9
                </div>
              </div>
              <Link href="/town/experts" className="text-[11px] font-bold text-primary">
                프로필 ›
              </Link>
            </div>
            <div className="flex items-center justify-between py-[7px] text-xs">
              <div>
                <div className="font-bold text-ink">관양 재건축 흐름 분석 (리포트)</div>
                <div className="text-[10px] text-text-3">
                  <Highlight /> 사업성 분석 포함 · 9,900원
                </div>
              </div>
              <Link href="/town/experts" className="text-[11px] font-bold text-primary">
                미리보기 ›
              </Link>
            </div>
          </div>

          <div className="rise-in-3">
            <AIPanel title="검색 요약">
              ‘공작’ 검색의 87%는 공작아파트입니다. 핵심: 급매 1건(7.9억) · 노트 평균
              76점 · 재건축 초기 논의.{" "}
              <Link href="/complex/mock-1" className="font-bold text-ai-accent">
                단지 홈에서 한번에 보기 ›
              </Link>
            </AIPanel>
          </div>

          <div className="rise-in-4 card flex flex-col gap-1.5 rounded-[18px] px-[18px] py-4">
            <div className="text-xs font-extrabold text-ink">인기 검색</div>
            <div className="flex flex-wrap gap-[5px]">
              {RECENT_KEYWORDS.map((k) => (
                <span
                  key={k}
                  className="chip bg-[#f2f4f8] px-[11px] py-[5px] text-[11px] text-text-2"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
      </SearchClient>
    </PageShell>
  );
}
