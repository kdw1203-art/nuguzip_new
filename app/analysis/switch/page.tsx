import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { ExampleBadge, SimulationNotice } from "../../components/ExampleBadge";

const PROFILE_ON = ["30대", "남", "2인 거주", "직장인"];
const PROFILE_OFF = ["1인 거주", "3인 이상", "사업자", "법인"];

const REGIONS = [
  {
    rank: "1. 안양 관양동",
    fit: "적합도 92%",
    hot: true,
    desc: "평균 8.3억 · 통근 +5분 · 학군 유지 · 재건축 여지",
    cost: "월 부담 +58만",
    costTone: "blue",
    note: "내 노트 3건 보유",
  },
  {
    rank: "2. 과천 별양동",
    fit: "적합도 87%",
    hot: false,
    desc: "평균 11.1억 · 통근 -10분 · 학군 상향 · 하락 폭 큼",
    cost: "월 부담 +112만",
    costTone: "red",
    note: "노트 없음",
  },
  {
    rank: "3. 의왕 포일동",
    fit: "적합도 81%",
    hot: false,
    desc: "평균 7.6억 · 신축 위주 · 현금 여유 확보 가능",
    cost: "월 부담 +21만",
    costTone: "blue",
    note: "노트 없음",
  },
] as const;

const COMPLEXES = [
  {
    name: "공작아파트 84A",
    meta: "8.4억 · 통근 28분 · 방3",
    badge: { text: "내 노트 3", tone: "blue" },
    fit: "적합 94%",
    fitHot: true,
  },
  {
    name: "동편마을 3단지 84",
    meta: "10.2억 · 통근 31분 · 주차 1.4대",
    badge: null,
    fit: "적합 89%",
    fitHot: false,
  },
  {
    name: "인덕원 대우 84",
    meta: "8.1억 · 역 4분 · 인덕원선 호재",
    badge: { text: "급매 1", tone: "red" },
    fit: "적합 86%",
    fitHot: false,
  },
] as const;

const FLOWS = [
  { label: "관양동", width: "76%", color: "#1d4fd8", pct: "38%", pctTone: "text-primary" },
  { label: "과천", width: "48%", color: "#7ea2ff", pct: "24%", pctTone: "text-text-1" },
  { label: "의왕", width: "34%", color: "#a9bde8", pct: "17%", pctTone: "text-text-1" },
  { label: "기타", width: "21%", color: "#d6deed", pct: "21%", pctTone: "text-text-3" },
] as const;

export default function SwitchPage() {
  return (
    <PageShell breadcrumb="AI 분석 › 포트폴리오 › 갈아타기 추천">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">갈아타기 추천 지역</h1>
        <span className="text-xs text-text-3">기준: 평촌 초원마을 매도 (가용 6.9억 + 대출)</span>
      </div>
      <div className="rise-in mb-3">
        <SimulationNotice />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3">
          {/* 조건 직접 설정 */}
          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-2xl px-[18px] py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-extrabold text-ink">조건 직접 설정</span>
              <span className="text-[10px] text-text-3">회원가입 프로필 자동 반영 · 수정 가능</span>
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="flex flex-1 items-center gap-1.5 rounded-[10px] bg-bg px-3 py-[9px] text-xs">
                <span className="text-text-3">지역</span>
                <span className="font-extrabold text-ink">안양·과천·의왕 ▾</span>
              </div>
              <div className="flex flex-1 items-center gap-1.5 rounded-[10px] bg-bg px-3 py-[9px] text-xs">
                <span className="text-text-3">금액대</span>
                <span className="font-extrabold text-ink">7~10억 ▾</span>
              </div>
              <span className="cursor-default rounded-[10px] border border-line bg-bg px-4 py-[9px] text-center text-xs font-semibold text-text-3">
                추천 오픈 준비 중
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-[5px]">
              <span className="mr-0.5 text-[10px] text-text-3">내 프로필</span>
              {PROFILE_ON.map((p) => (
                <span key={p} className="chip chip-soft px-2.5 py-1 text-[11px]">
                  {p}
                </span>
              ))}
              {PROFILE_OFF.map((p) => (
                <span key={p} className="chip bg-[#f2f4f8] px-2.5 py-1 text-[11px] text-text-2">
                  {p}
                </span>
              ))}
              <span className="px-1.5 py-1 text-[11px] text-text-3">✎ 프로필 수정</span>
            </div>
            <div className="text-[10px] text-[#adb5bd]">
              30대 · 2인 · 직장인 기준 — 통근 30분 내, DSR 여유, 향후 3인 확장(방3) 조건에 가중치가
              적용됩니다
            </div>
          </div>

          <div className="rise-in-2 px-1 text-sm font-extrabold text-ink">
            AI 추천 갈아타기 지역{" "}
            <span className="text-[11px] font-medium text-text-3">예산·통근·학군 조건 기준</span>
          </div>

          {REGIONS.map((r, i) => (
            <div
              key={r.rank}
              className={`rise-in-${i + 2} flex items-center justify-between rounded-2xl bg-surface px-[18px] py-4 ${
                r.hot ? "border-[1.5px] border-primary" : "border border-line"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-extrabold text-ink">{r.rank}</span>
                  <span
                    className={`rounded-[5px] px-2 py-0.5 text-[10px] font-extrabold ${
                      r.hot ? "bg-primary-soft text-primary" : "bg-[#f2f4f8] text-text-2"
                    }`}
                  >
                    {r.fit}
                  </span>
                </div>
                <div className="mt-1 text-xs text-text-2">{r.desc}</div>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={`text-xs font-bold ${r.costTone === "red" ? "text-danger" : "text-primary"}`}
                >
                  {r.cost}
                </div>
                <div className="text-[11px] text-text-3">{r.note}</div>
              </div>
            </div>
          ))}

          {/* 1위 추천 단지 */}
          <div className="rise-in-5 card flex flex-col gap-2 rounded-2xl px-[18px] py-3.5">
            <div className="text-[13px] font-extrabold text-ink">
              1위 관양동 추천 단지{" "}
              <span className="text-[10px] font-medium text-text-3">
                30대 · 2인 · 직장인 · 7~10억 기준
              </span>
            </div>
            {COMPLEXES.map((c, i) => (
              <div
                key={c.name}
                className={`flex items-center justify-between gap-2 py-[7px] text-xs ${
                  i < COMPLEXES.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <span>
                  <b className="text-ink">{c.name}</b>{" "}
                  <span className="text-text-3">{c.meta}</span>{" "}
                  {c.badge && (
                    <span
                      className={`rounded px-1.5 py-px text-[9px] font-extrabold ${
                        c.badge.tone === "red"
                          ? "bg-danger-soft text-danger"
                          : "bg-primary-soft text-primary"
                      }`}
                    >
                      {c.badge.text}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 font-extrabold ${c.fitHot ? "text-primary" : "text-text-1"}`}
                >
                  {c.fit}
                </span>
              </div>
            ))}
            <Link
              href="/analysis/compare"
              className="mt-1 self-start text-[11px] font-bold text-primary no-underline"
            >
              3개 단지 다자 비교로 보기 ›
            </Link>
          </div>
        </div>

        {/* 이동 흐름 */}
        <div className="rise-in-2 card flex h-fit flex-col gap-2.5 rounded-[18px] px-5 py-[18px]">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-extrabold text-ink">
            평촌에서 갈아탄 이용자들은
            {/* 이동 통계 실데이터 미연결 — 예시 수치 */}
            <ExampleBadge />
          </div>
          {FLOWS.map((f) => (
            <div key={f.label} className="flex items-center gap-2.5">
              <span className="w-[70px] shrink-0 text-xs font-bold text-text-1">{f.label}</span>
              <div className="relative h-[18px] flex-1 rounded-[5px] bg-[#eef1f6]">
                <div
                  className="absolute left-0 h-[18px] rounded-[5px]"
                  style={{ width: f.width, background: f.color }}
                />
              </div>
              <span className={`text-[11px] font-extrabold ${f.pctTone}`}>{f.pct}</span>
            </div>
          ))}
          {/* 사실 우선: 실시간 접속자 수 집계 소스가 없어 허위 "128명 보는 중" 문구 제거 */}
        </div>
      </div>
    </PageShell>
  );
}
