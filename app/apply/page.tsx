import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";

const CAL_DAYS: { day: number; muted?: boolean; mark?: "receipt" | "announce" | "planned" }[] = [
  { day: 28, muted: true },
  { day: 29, muted: true },
  { day: 30, muted: true },
  { day: 31, muted: true },
  { day: 1, mark: "receipt" },
  { day: 2 },
  { day: 3 },
  { day: 4, mark: "receipt" },
  { day: 5 },
  { day: 6 },
  { day: 7, mark: "planned" },
  { day: 8 },
  { day: 9 },
  { day: 10 },
  { day: 11 },
  { day: 12, mark: "announce" },
  { day: 13 },
  { day: 14 },
  { day: 15 },
  { day: 16 },
  { day: 17 },
];

const MARK_BG = { receipt: "bg-danger", announce: "bg-primary", planned: "bg-[#c9d4e5]" } as const;

function AdSlot() {
  return (
    <div className="flex h-16 flex-col items-center justify-center gap-[3px] rounded-[14px] border border-dashed border-[#d8dfea] bg-surface">
      <span className="rounded border border-[#e2e7ee] px-1.5 text-[9px] font-bold tracking-widest text-[#adb5bd]">
        AD
      </span>
      <span className="font-mono text-[11px] text-[#adb5bd]">AdSense 320×64</span>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <PageShell breadcrumb="지도 › 청약 센터" wide>
      {/* 상단 탭 + 필터 (9q) */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5 text-[13px]">
          <span className="rounded-full bg-ink px-3.5 py-2 font-bold text-white">전체 24</span>
          <span className="glass rounded-full px-3.5 py-2 font-semibold text-text-2">예정 9</span>
          <span className="glass rounded-full px-3.5 py-2 font-bold text-danger">접수 중 3</span>
          <span className="glass rounded-full px-3.5 py-2 font-semibold text-text-2">지난 청약 12</span>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1.5 text-xs">
          <span className="rounded-full bg-[rgba(29,79,216,.12)] px-3.5 py-2 font-bold text-primary">
            내 관심지역만
          </span>
          <span className="glass rounded-full px-3.5 py-2 font-semibold text-text-2">
            가점 도달 가능만
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-3">
          {/* 캘린더 (9q) */}
          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-ink">8월 청약 캘린더</span>
              <div className="flex gap-2.5 text-[11px]">
                <span className="flex items-center gap-1 text-text-2">
                  <span className="h-2 w-2 rounded-[2px] bg-danger" />
                  접수
                </span>
                <span className="flex items-center gap-1 text-text-2">
                  <span className="h-2 w-2 rounded-[2px] bg-primary" />
                  발표
                </span>
                <span className="flex items-center gap-1 text-text-2">
                  <span className="h-2 w-2 rounded-[2px] bg-[#c9d4e5]" />
                  예정 공고
                </span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[#adb5bd]">
              {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {CAL_DAYS.map((d, i) => (
                <div
                  key={i}
                  className={`h-11 rounded-lg px-1.5 py-1 text-[10px] ${
                    d.mark
                      ? "border border-line bg-[rgba(29,79,216,.05)] text-text-1"
                      : "bg-bg text-text-3"
                  }`}
                >
                  {d.day}
                  {d.mark && <div className={`mt-0.5 h-1.5 rounded-[2px] ${MARK_BG[d.mark]}`} />}
                </div>
              ))}
            </div>
          </div>

          {/* 접수 중 목록 (9q) */}
          <div className="rise-in-2 px-1 text-xs font-extrabold text-danger">접수 중 3</div>
          <div className="rise-in-2 flex flex-col gap-3 rounded-2xl border-[1.5px] border-danger bg-surface px-[18px] py-3.5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-danger px-2 py-1 text-[11px] font-extrabold text-white">
                D-2
              </span>
              <div>
                <div className="text-sm font-extrabold text-ink">
                  과천지식정보타운 S7{" "}
                  <span className="rounded bg-[#fdf3e7] px-[7px] py-0.5 text-[10px] font-extrabold text-[#c07a3a]">
                    공공
                  </span>
                </div>
                <div className="text-[11px] text-text-3">84 기준 8.9억 · 시세 대비 -21% · 608세대</div>
              </div>
            </div>
            <div className="flex items-center gap-3.5">
              <div className="text-right">
                <div className="text-[11px] text-text-3">예상 경쟁률</div>
                <div className="text-[13px] font-extrabold text-danger">120:1</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-text-3">내 가점 52 vs 컷</div>
                <div className="text-[13px] font-extrabold text-danger">-6점</div>
              </div>
              <span className="btn-primary rounded-[10px] px-4 py-[9px] text-xs">상세 ›</span>
            </div>
          </div>
          <div className="rise-in-2 card flex flex-col gap-3 rounded-2xl px-[18px] py-3.5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-danger px-2 py-1 text-[11px] font-extrabold text-white">
                D-5
              </span>
              <div>
                <div className="text-sm font-extrabold text-ink">
                  안양 어반포레 자이{" "}
                  <span className="rounded bg-[#f2f4f8] px-[7px] py-0.5 text-[10px] font-extrabold text-text-2">
                    민간
                  </span>
                </div>
                <div className="text-[11px] text-text-3">84 기준 9.8억 · 시세 대비 -8% · 1,021세대</div>
              </div>
            </div>
            <div className="flex items-center gap-3.5">
              <div className="text-right">
                <div className="text-[11px] text-text-3">예상 경쟁률</div>
                <div className="text-[13px] font-extrabold text-text-1">22:1</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-text-3">내 가점 52 vs 컷</div>
                <div className="text-[13px] font-extrabold text-primary">+3점 도달</div>
              </div>
              <span className="btn-primary rounded-[10px] px-4 py-[9px] text-xs">상세 ›</span>
            </div>
          </div>

          {/* 예정 (9q) */}
          <div className="rise-in-3 px-1 pt-1.5 text-xs font-extrabold text-text-3">예정 9 · 가까운 순</div>
          <div className="rise-in-3 card flex items-center justify-between rounded-2xl px-[18px] py-3.5">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-[#f2f4f8] px-2 py-1 text-[11px] font-extrabold text-text-2">
                9월
              </span>
              <div>
                <div className="text-sm font-extrabold text-ink">인덕원 자이 SK뷰</div>
                <div className="text-[11px] text-text-3">
                  분양가 미정 (추정 10.2억) · 771세대 · 공고 예정 9.4
                </div>
              </div>
            </div>
            <span className="rounded-[10px] bg-primary-soft px-4 py-[9px] text-xs font-bold text-primary">
              공고 알림 ✓
            </span>
          </div>
          <div className="rise-in-3 card flex items-center justify-between rounded-2xl px-[18px] py-3.5">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-[#f2f4f8] px-2 py-1 text-[11px] font-extrabold text-text-2">
                2027
              </span>
              <div>
                <div className="text-sm font-extrabold text-ink">안양 관양 재개발</div>
                <div className="text-[11px] text-text-3">
                  일반분양 2,340세대 중 약 600 · 내 노트 단지 인접
                </div>
              </div>
            </div>
            <span className="rounded-[10px] bg-primary-soft px-4 py-[9px] text-xs font-bold text-primary">
              공고 알림 ›
            </span>
          </div>

          {/* 지난 청약 (9q) */}
          <div className="rise-in-4 px-1 pt-1.5 text-xs font-extrabold text-text-3">
            지난 청약 12 · 결과 데이터
          </div>
          <div className="rise-in-4 card overflow-x-auto rounded-2xl px-[18px] py-1">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-2 border-b border-[#f0f3f8] py-2 text-[10px] text-text-3">
                <span>단지</span>
                <span className="text-center">분양가(84)</span>
                <span className="text-center">경쟁률</span>
                <span className="text-center">당첨 컷</span>
                <span className="text-center">현재 프리미엄</span>
              </div>
              <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs">
                <span className="font-bold text-ink">과천 S6 (25.11)</span>
                <span className="text-center font-bold text-text-1">8.6억</span>
                <span className="text-center font-extrabold text-danger">98:1</span>
                <span className="text-center font-bold text-text-1">58점</span>
                <span className="text-center font-extrabold text-primary">+1.8억</span>
              </div>
              <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] items-center gap-2 py-2.5 text-xs">
                <span className="font-bold text-ink">인덕원 퍼스비엘 (24.06)</span>
                <span className="text-center font-bold text-text-1">10.1억</span>
                <span className="text-center font-extrabold text-text-1">14:1</span>
                <span className="text-center font-bold text-text-1">44점</span>
                <span className="text-center font-extrabold text-text-2">+0.3억</span>
              </div>
            </div>
          </div>
        </div>

        {/* 우측 사이드 (9q) */}
        <aside className="flex flex-col gap-3.5">
          <div className="rise-in-2">
            <AIPanel title="내 가점 52점으로는" className="rounded-[18px]">
              <div className="mb-1.5 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                <span className="text-ai-muted">가점제 당첨권</span>
                <span className="font-extrabold text-[#7ea2ff]">24건 중 2건</span>
              </div>
              <div className="mb-2 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                <span className="text-ai-muted">추첨제 지원 가능</span>
                <span className="font-extrabold text-white">7건</span>
              </div>
              이번 달은 <b className="text-[#7ea2ff]">어반포레 자이(가점 도달)</b>가 현실적
              기회입니다. S7은 추첨제 59타입만 지원을 권장합니다.
              <div className="btn-primary mt-2.5 rounded-[10px] p-[11px] text-center text-xs">
                가점 도달 가능만 보기
              </div>
            </AIPanel>
          </div>
          <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">지역별 요약</div>
            {[
              { region: "과천", meta: "접수 1 · 예정 2 · 평균 경쟁 84:1" },
              { region: "안양", meta: "접수 2 · 예정 4 · 평균 경쟁 19:1" },
              { region: "의왕", meta: "예정 3 · 평균 경쟁 11:1" },
            ].map((r, i, arr) => (
              <div
                key={r.region}
                className={`flex justify-between py-[7px] text-xs ${
                  i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <span className="font-bold text-ink">{r.region}</span>
                <span className="text-text-2">{r.meta}</span>
              </div>
            ))}
          </div>
          <div className="rise-in-4">
            <AdSlot />
          </div>
        </aside>
      </div>

      {/* ================= 청약 상세 (9p — 과천 S7) ================= */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="rise-in-4 card flex flex-col gap-3.5 rounded-[20px] p-6">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-[5px] bg-danger px-2 py-[3px] text-[11px] font-extrabold text-white">
                  D-12
                </span>
                <span className="rounded-[5px] bg-[#fdf3e7] px-2 py-[3px] text-[11px] font-extrabold text-[#c07a3a]">
                  공공분양
                </span>
              </div>
              <h2 className="mt-2 text-[21px] font-extrabold text-ink">과천지식정보타운 S7블록</h2>
              <p className="mt-1 text-[13px] text-text-2">
                전용 59·84 · 608세대 · 2029.03 입주 예정 · 특별공급 8.1 접수
              </p>
            </div>
            <span className="w-fit rounded-[10px] bg-primary-soft px-4 py-[9px] text-xs font-bold text-primary">
              알림 받는 중 ✓
            </span>
          </div>
          <div className="grid gap-2.5 md:grid-cols-3">
            <div className="rounded-xl bg-bg p-3.5">
              <div className="text-[11px] text-text-3">분양가 (84 기준)</div>
              <div className="mt-[3px] text-[19px] font-extrabold text-ink">8.9억</div>
              <div className="mt-0.5 text-[10px] text-text-3">㎡당 1,060만</div>
            </div>
            <div className="rounded-xl bg-[rgba(29,79,216,.06)] p-3.5">
              <div className="text-[11px] text-[#5b74b8]">인근 시세 대비</div>
              <div className="mt-[3px] text-[19px] font-extrabold text-primary">-21%</div>
              <div className="mt-0.5 text-[10px] text-[#5b74b8]">과천 신축 84 평균 11.3억</div>
            </div>
            <div className="rounded-xl bg-bg p-3.5">
              <div className="text-[11px] text-text-3">예상 경쟁률 (AI)</div>
              <div className="mt-[3px] text-[19px] font-extrabold text-danger">120:1 내외</div>
              <div className="mt-0.5 text-[10px] text-text-3">S6 실적 98:1 기반 추정</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="mb-1.5 text-[13px] font-extrabold text-ink">인근 청약 히스토리 · 예정</div>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-2 border-b border-[#f0f3f8] py-[7px] text-[11px] text-text-3">
                <span>단지</span>
                <span className="text-center">구분</span>
                <span className="text-center">분양가(84)</span>
                <span className="text-center">경쟁률</span>
                <span className="text-center">현재 시세/프리미엄</span>
              </div>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs">
                <span className="font-bold text-ink">과천 S6 (2025.11)</span>
                <span className="text-center text-text-2">지난 청약</span>
                <span className="text-center font-bold text-text-1">8.6억</span>
                <span className="text-center font-extrabold text-danger">98:1</span>
                <span className="text-center font-extrabold text-primary">+1.8억</span>
              </div>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs">
                <span className="font-bold text-ink">인덕원 퍼스비엘 (2024.06)</span>
                <span className="text-center text-text-2">지난 청약</span>
                <span className="text-center font-bold text-text-1">10.1억</span>
                <span className="text-center font-extrabold text-text-1">14:1</span>
                <span className="text-center font-extrabold text-text-2">+0.3억</span>
              </div>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] items-center gap-2 py-2.5 text-xs">
                <span className="font-bold text-ink">안양 관양 재개발 (2027 예정)</span>
                <span className="text-center font-bold text-[#c07a3a]">예정</span>
                <span className="text-center font-bold text-text-3">미정</span>
                <span className="text-center font-bold text-text-3">—</span>
                <span className="text-center text-[11px] font-bold text-primary">알림 신청 ›</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-extrabold text-ink">
                  인근 단지 시세 비교{" "}
                  <span className="text-[11px] font-medium text-text-3">분양가 8.9억 대비 · 84 기준</span>
                </span>
                <span className="text-[11px] font-bold text-primary">지도에서 보기 ›</span>
              </div>
              <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_.8fr_.9fr] gap-2 border-b border-[#f0f3f8] py-2 text-[10px] text-text-3">
                <span>단지 (거리)</span>
                <span className="text-center">시세</span>
                <span className="text-center">평단가</span>
                <span className="text-center">분양가 대비</span>
                <span className="text-center">연식</span>
                <span className="text-center">3개월 흐름</span>
              </div>
              {[
                { name: "과천 위버필드 (0.8km)", price: "12.1억", py: "4,470만", diff: "+3.2억 (+36%)", diffTone: "text-primary", age: "5년", trend: "▼0.6%", trendTone: "text-primary" },
                { name: "과천 S6 푸르지오 (0.4km)", price: "10.4억", py: "3,840만", diff: "+1.5억 (+17%)", diffTone: "text-primary", age: "입주 1년", trend: "보합", trendTone: "text-text-2" },
                { name: "인덕원 푸르지오 (1.6km)", price: "9.6억", py: "3,550만", diff: "+0.7억 (+8%)", diffTone: "text-text-1", age: "8년", trend: "▼1.1%", trendTone: "text-primary" },
              ].map((r, i, arr) => (
                <div
                  key={r.name}
                  className={`grid grid-cols-[1.5fr_1fr_1fr_1fr_.8fr_.9fr] items-center gap-2 py-2.5 text-xs ${
                    i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <span className="font-bold text-ink">{r.name}</span>
                  <span className="text-center font-extrabold text-ink">{r.price}</span>
                  <span className="text-center font-bold text-text-1">{r.py}</span>
                  <span className={`text-center font-extrabold ${r.diffTone}`}>{r.diff}</span>
                  <span className="text-center font-bold text-text-1">{r.age}</span>
                  <span className={`text-center font-bold ${r.trendTone}`}>{r.trend}</span>
                </div>
              ))}
              <div className="mt-1.5 rounded-[10px] bg-[rgba(29,79,216,.06)] px-3 py-2 text-[11px] text-[#5b74b8]">
                인근 신축 3곳 평균 시세 10.7억(평단가 3,950만) — 분양가 8.9억(평단가 3,290만)은{" "}
                <b className="text-primary">안전마진 약 1.8억(+20%)</b> 구간. 가장 보수적인
                인덕원(3,550만) 기준으로도 평단가 +8%입니다.
              </div>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3.5">
          <div className="rise-in-5">
            <AIPanel title="내 청약 전략" className="rounded-[18px]">
              <div className="mb-1.5 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                <span className="text-ai-muted">내 가점 (무주택 7년·부양 2)</span>
                <span className="font-extrabold text-white">52점</span>
              </div>
              <div className="mb-2 flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs">
                <span className="text-ai-muted">S6 당첨 커트라인</span>
                <span className="font-extrabold text-[#7ea2ff]">58점</span>
              </div>
              가점제 당첨권에는 6점 부족합니다.{" "}
              <b className="text-[#7ea2ff]">추첨제 물량(59 타입 30%)</b> 지원 + 기존 매수 트랙을
              병행하는 전략을 권장합니다.
              <div className="btn-primary mt-2.5 rounded-[10px] p-[11px] text-center text-xs">
                매수 vs 청약 대기 시나리오 비교
              </div>
            </AIPanel>
          </div>
          <div className="rise-in-6 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">청약 알림 설정</div>
            {[
              { label: "관심지역 신규 공고", on: true },
              { label: "접수 마감 D-3 리마인드", on: true },
              { label: "당첨 결과·커트라인 공개", on: false },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-xs text-text-1">
                <span>{row.label}</span>
                <span
                  className={`relative inline-block h-[22px] w-[38px] rounded-full ${
                    row.on ? "bg-primary" : "bg-[#e2e7ee]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white ${
                      row.on ? "right-0.5" : "left-0.5"
                    }`}
                  />
                </span>
              </div>
            ))}
          </div>
          <AdSlot />
        </aside>
      </div>
    </PageShell>
  );
}
