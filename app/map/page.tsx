"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "../components/Logo";

/* ============================================================
   지도 탐색 (6a) — 줌 3단계(8g) · 단지 상세 패널(9q) · 매물보기(8e)
   지도는 SDK 플레이스홀더, 오버레이는 목업 데이터
   ============================================================ */

type Zoom = "city" | "dong" | "danji";

const ZOOM_TABS: { key: Zoom; label: string }[] = [
  { key: "city", label: "시·군·구" },
  { key: "dong", label: "동" },
  { key: "danji", label: "단지" },
];

const ZOOM_CAPTION: Record<Zoom, string> = {
  city: "줌 레벨 9 · 지역 집계 버블",
  dong: "줌 레벨 12 · 동별 시세 + 활동량",
  danji: "줌 레벨 15 · 단지/매물 표시",
};

const DANJI_LIST = [
  {
    name: "공작아파트",
    note: "노트 3",
    meta: "1988년 · 1,486세대 · 용적률 199%",
    price: "8.4억",
    delta: "▼ 2.1%",
    deltaTone: "down",
    size: "84㎡",
    active: true,
  },
  {
    name: "한가람세경",
    note: null,
    meta: "1992년 · 918세대 · 용적률 214%",
    price: "7.9억",
    delta: "▲ 0.8%",
    deltaTone: "up",
    size: "84㎡",
    active: false,
  },
  {
    name: "동편마을 3단지",
    note: "노트 1",
    meta: "2012년 · 762세대 · 용적률 179%",
    price: "10.2억",
    delta: "▼ 1.4%",
    deltaTone: "down",
    size: "84㎡",
    active: false,
  },
] as const;

const DETAIL_TABS = ["요약", "매물 12", "실거래", "노트 15", "이야기"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

const LISTINGS = [
  {
    badge: "급매",
    urgent: true,
    watching: "34명이 보는 중",
    price: "매매 7.9억",
    priceNote: "시세 대비 -6%",
    meta: "84A · 5층/15층 · 남향 · 즉시입주",
    tags: [
      { label: "올수리", tone: "blue" },
      { label: "주차 1대", tone: "gray" },
    ],
    agent: "관양공인 · 오늘 등록",
  },
  {
    badge: "일반",
    urgent: false,
    watching: "8명이 보는 중",
    price: "매매 8.4억",
    priceNote: null,
    meta: "84A · 12층/15층 · 남동향 · 협의",
    tags: [{ label: "로얄층", tone: "blue" }],
    agent: "평촌공인 · 3일 전",
  },
  {
    badge: "일반",
    urgent: false,
    watching: "5명이 보는 중",
    price: "매매 8.2억",
    priceNote: null,
    meta: "84B · 9층/15층 · 남서향 · 세안고",
    tags: [{ label: "수리 필요", tone: "red" }],
    agent: "관양중앙공인 · 1주 전",
  },
] as const;

const TRADES = [
  { date: "2026.06.28", price: "8.15억", floor: "5층", delta: "▼ 1.8%", tone: "down" },
  { date: "2026.05.14", price: "8.3억", floor: "11층", delta: "▼ 0.6%", tone: "down" },
  { date: "2026.03.02", price: "8.75억", floor: "7층", delta: "▲ 0.9%", tone: "up" },
] as const;

const NOTES = [
  { title: "공작 302동 — “주차가 관건, 저녁 실측”", author: "첫집준비중 · 07.12", score: "78점" },
  { title: "공작 105동 — “겨울 채광 확인함”", author: "관양토박이 · 07.15", score: "81점" },
] as const;

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6 L22 10.4 V20 a1.4 1.4 0 0 1 -1.4 1.4 H14.8 V14.6 H9.2 V21.4 H3.4 A1.4 1.4 0 0 1 2 20 V10.4 Z"
        fill="#8b95a1"
      />
    </svg>
  );
}

export default function MapPage() {
  const [zoom, setZoom] = useState<Zoom>("danji");
  const [panelOpen, setPanelOpen] = useState(true);
  const [selected, setSelected] = useState(false); // 공작아파트 상세 패널
  const [detailTab, setDetailTab] = useState<DetailTab>("요약");

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef]">
      {/* 지도 SDK 플레이스홀더 라벨 */}
      <div className="absolute right-5 top-[92px] z-[2] rounded-lg bg-[rgba(255,255,255,.8)] px-2.5 py-[5px] font-mono text-[11px] text-text-2">
        네이버/카카오 지도 SDK 영역
      </div>

      {/* ===== 상단 플로팅 글래스 헤더 ===== */}
      <div className="glass-strong absolute left-1/2 top-4 z-40 flex h-[58px] w-[calc(100%-32px)] max-w-[1180px] -translate-x-1/2 items-center gap-4 rounded-[18px] px-5">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>
        <Link
          href="/search"
          className="hidden w-[280px] items-center gap-2 rounded-xl border border-[rgba(255,255,255,.9)] bg-[rgba(255,255,255,.7)] px-3.5 py-2 text-sm text-text-1 md:flex"
        >
          ⌕ 관양동
        </Link>
        <div className="hidden gap-1.5 lg:flex">
          <span className="chip chip-active px-3.5 py-2 text-[13px]">매매</span>
          <span className="chip bg-[rgba(255,255,255,.7)] px-3.5 py-2 text-[13px] text-text-2">전세</span>
          <span className="chip bg-[rgba(255,255,255,.7)] px-3.5 py-2 text-[13px] text-text-2">평형 ▾</span>
          <span className="chip bg-[rgba(255,255,255,.7)] px-3.5 py-2 text-[13px] text-text-2">가격 ▾</span>
          <span className="chip bg-[rgba(29,79,216,.12)] px-3.5 py-2 text-[13px] font-bold text-primary">
            내 임장 단지만
          </span>
        </div>
        <div className="flex-1" />
        <Link href="/notes/new" className="btn-primary btn-cta shrink-0 rounded-xl px-4 py-[9px] text-[13px]">
          이 지역 노트 쓰기
        </Link>
      </div>

      {/* ===== 줌 레벨 탭 (use client 전환) ===== */}
      <div className="glass absolute right-5 top-[92px] z-30 mt-9 flex items-center gap-0.5 rounded-full p-1 md:mt-0 md:translate-y-9">
        {ZOOM_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setZoom(t.key);
              setSelected(false);
            }}
            className={`chip px-3 py-1.5 text-xs transition-colors ${
              zoom === t.key ? "bg-[rgba(29,79,216,.12)] font-bold text-primary" : "text-text-1"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="absolute right-5 top-[92px] z-30 hidden translate-y-[76px] rounded-lg bg-[rgba(255,255,255,.8)] px-2.5 py-[5px] text-[11px] text-text-3 md:block">
        {ZOOM_CAPTION[zoom]}
      </div>

      {/* ===== 줌별 지도 오버레이 목업 ===== */}
      {zoom === "city" && (
        <>
          {/* 시군구 집계 버블 */}
          <div className="rise-in absolute left-[38%] top-[24%] z-[2] flex h-[110px] w-[110px] flex-col items-center justify-center rounded-full bg-[rgba(29,79,216,.85)] text-white shadow-[0_10px_28px_rgba(29,79,216,.35)]">
            <div className="text-[13px] font-extrabold">동안구</div>
            <div className="text-base font-extrabold">7.1억</div>
            <div className="text-[10px] opacity-85">▼1.2% · 342건</div>
          </div>
          <div className="rise-in-1 absolute left-[58%] top-[48%] z-[2] flex h-[90px] w-[90px] flex-col items-center justify-center rounded-full bg-[rgba(29,79,216,.65)] text-white">
            <div className="text-xs font-extrabold">과천시</div>
            <div className="text-sm font-extrabold">14.2억</div>
            <div className="text-[9px] opacity-85">▼0.8% · 98건</div>
          </div>
          <div className="rise-in-2 absolute left-[64%] top-[26%] z-[2] flex h-[74px] w-[74px] flex-col items-center justify-center rounded-full border border-[rgba(255,255,255,.9)] bg-[rgba(255,255,255,.85)] text-ink shadow-[0_4px_14px_rgba(16,28,54,.12)]">
            <div className="text-[11px] font-extrabold">만안구</div>
            <div className="text-[13px] font-extrabold">5.4억</div>
            <div className="delta-up text-[9px]">▲0.3%</div>
          </div>
          {/* 하단 오버레이 바 */}
          <div className="glass absolute bottom-24 left-5 z-[3] flex w-[300px] flex-col gap-1.5 rounded-[14px] px-3.5 py-3">
            <div className="flex justify-between text-[11px]">
              <span className="text-text-2">지금 이 지역을 보는 사람</span>
              <span className="font-extrabold text-primary">1,284명</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-text-2">활동 전문가 / 이번 주 새 노트</span>
              <span className="font-extrabold text-ink">전문가 23명 · 노트 156건</span>
            </div>
          </div>
        </>
      )}

      {zoom === "dong" && (
        <>
          <div className="glass absolute left-5 top-[92px] z-[3] rounded-[10px] px-3 py-[7px] text-[10px] text-text-2 md:left-auto md:right-[280px]">
            관양동 — 이번 주 관심 급상승 +38%
          </div>
          <div className="rise-in absolute left-[36%] top-[28%] z-[2] rounded-[14px] bg-[rgba(29,79,216,.92)] px-3.5 py-2.5 text-white shadow-[0_8px_22px_rgba(29,79,216,.35)]">
            <div className="text-xs font-extrabold">관양동</div>
            <div className="text-[15px] font-extrabold">
              8.1억 <span className="text-[10px]">▼2.1%</span>
            </div>
            <div className="text-[9px] opacity-85">214 · 노트 38 · 전문가 5</div>
          </div>
          <div className="rise-in-1 absolute left-[56%] top-[44%] z-[2] rounded-[14px] border border-[rgba(255,255,255,.95)] bg-[rgba(255,255,255,.88)] px-3.5 py-2.5 text-ink shadow-[0_4px_14px_rgba(16,28,54,.12)]">
            <div className="text-xs font-extrabold">평촌동</div>
            <div className="text-[15px] font-extrabold">
              9.3억 <span className="delta-down text-[10px]">▼1.5%</span>
            </div>
            <div className="text-[9px] text-text-3">156 · 노트 24 · 전문가 8</div>
          </div>
          <div className="rise-in-2 absolute left-[40%] top-[62%] z-[2] rounded-[14px] border border-[rgba(255,255,255,.95)] bg-[rgba(255,255,255,.88)] px-3.5 py-2.5 text-ink shadow-[0_4px_14px_rgba(16,28,54,.12)]">
            <div className="text-xs font-extrabold">비산동</div>
            <div className="text-[15px] font-extrabold">
              6.7억 <span className="delta-flat text-[10px]">—</span>
            </div>
            <div className="text-[9px] text-text-3">89 · 노트 11 · 전문가 2</div>
          </div>
        </>
      )}

      {zoom === "danji" && (
        <>
          {/* 단지 개별 핀 — 급매는 빨간 점 오버레이 */}
          <button
            type="button"
            onClick={() => {
              setSelected(true);
              setDetailTab("요약");
            }}
            className={`absolute left-[42%] top-[32%] z-[2] rounded-xl bg-primary px-3 py-2 text-left text-[13px] font-extrabold text-white ${
              selected
                ? "shadow-[0_0_0_4px_rgba(29,79,216,.25),0_8px_20px_rgba(29,79,216,.45)]"
                : "shadow-[0_6px_18px_rgba(29,79,216,.4)]"
            }`}
            style={selected ? undefined : { animation: "floatY 6s ease-in-out infinite" }}
          >
            8.4억
            <div className="text-[10px] font-semibold opacity-85">
              {selected ? "공작 · 선택됨" : "공작 · 매물12 · 노트3"}
            </div>
          </button>
          <span className="absolute left-[41.5%] top-[31%] z-[2] h-2.5 w-2.5 rounded-full border-2 border-white bg-danger shadow-[0_2px_6px_rgba(214,69,69,.5)]" />
          <div className="absolute left-[62%] top-[22%] z-[2] rounded-xl border border-[rgba(255,255,255,.9)] bg-[rgba(255,255,255,.85)] px-3 py-2 text-[13px] font-extrabold text-ink shadow-[0_4px_12px_rgba(16,28,54,.12)]">
            7.9억<div className="text-[10px] font-semibold text-text-3">한가람 · 매물7</div>
          </div>
          <div className="absolute left-[55%] top-[56%] z-[2] rounded-xl border border-[rgba(255,255,255,.9)] bg-[rgba(255,255,255,.85)] px-3 py-2 text-[13px] font-extrabold text-ink shadow-[0_4px_12px_rgba(16,28,54,.12)]">
            10.2억<div className="text-[10px] font-semibold text-text-3">동편3 · 노트1</div>
          </div>
          <div className="ai-panel absolute left-[40%] top-[44%] z-[2] rounded-[10px] px-2.5 py-1.5 text-[10px] font-bold text-white">
            지금 34명이 이 단지를 보는 중
          </div>
          {!selected && (
            <div className="glass absolute bottom-24 right-5 z-[3] hidden w-[280px] flex-col gap-[5px] rounded-[14px] px-3.5 py-3 md:flex">
              <div className="flex justify-between text-[11px]">
                <span className="text-text-2">이 단지 담당 전문가</span>
                <span className="font-extrabold text-ink">전문가 3명 (중개 2 · 세무 1)</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-text-2">24시간 조회 / 관심 등록</span>
                <span className="font-extrabold text-primary">412회 / +18명</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-text-2">🔴 급매 등록</span>
                <span className="font-extrabold text-danger">1건 · 시세 -6%</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== 좌측 사이드 패널 (320px, 접기 핸들) ===== */}
      {!selected && panelOpen && (
        <aside className="glass-strong absolute bottom-5 left-5 top-[92px] z-30 hidden w-[320px] flex-col overflow-hidden rounded-[20px] md:flex">
          <div className="flex items-baseline justify-between px-5 pb-2.5 pt-4">
            <div className="text-[15px] font-extrabold text-ink">관양동 단지 24</div>
            <div className="text-xs text-text-3">시세순 ▾</div>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3">
            {DANJI_LIST.map((d, i) => (
              <button
                key={d.name}
                type="button"
                onClick={() => {
                  if (d.active) {
                    setSelected(true);
                    setDetailTab("요약");
                  }
                }}
                className={`rise-in-${i + 1} flex flex-col gap-1.5 rounded-[14px] bg-surface px-4 py-3.5 text-left ${
                  d.active ? "border-[1.5px] border-primary" : "border border-line"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-bold text-ink">{d.name}</div>
                  {d.note ? (
                    <span className="rounded-[5px] bg-primary-soft px-2 py-[3px] text-[11px] font-bold text-primary">
                      {d.note}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#c3cad6]">노트 없음</span>
                  )}
                </div>
                <div className="text-xs text-text-3">{d.meta}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[17px] font-extrabold text-ink">{d.price}</span>
                  <span className={`text-xs ${d.deltaTone === "down" ? "delta-down" : "delta-up"}`}>
                    {d.delta}
                  </span>
                  <span className="text-xs text-text-3">{d.size}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="p-3.5">
            <Link
              href="/notes/compare"
              className="btn-soft block rounded-xl p-3 text-center text-[13px]"
            >
              선택 단지 비교 (2)
            </Link>
          </div>
        </aside>
      )}

      {/* 접기 핸들 ‹ */}
      {!selected && (
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-label={panelOpen ? "패널 접기" : "패널 열기"}
          className={`absolute top-1/2 z-30 hidden h-16 w-4 -translate-y-1/2 items-center justify-center rounded-r-xl border border-[rgba(255,255,255,.95)] bg-[rgba(255,255,255,.92)] text-[11px] text-text-3 shadow-[6px_0_14px_rgba(16,28,54,.08)] md:flex ${
            panelOpen ? "left-[340px]" : "left-0"
          }`}
        >
          {panelOpen ? "‹" : "›"}
        </button>
      )}

      {/* ===== 단지 클릭 → 상세 패널 (9q, 460px) ===== */}
      {selected && (
        <aside className="glass-strong rise-in absolute bottom-5 left-4 right-4 top-[92px] z-30 flex flex-col overflow-hidden rounded-[22px] md:left-5 md:right-auto md:w-[460px]">
          <div className="flex items-start justify-between border-b border-[rgba(16,28,54,.06)] px-[22px] pb-3.5 pt-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[19px] font-extrabold text-ink">공작아파트</span>
                <span className="rounded-[5px] bg-primary-soft px-2 py-0.5 text-[10px] font-extrabold text-primary">
                  내 노트 3
                </span>
                <span className="rounded-[5px] bg-danger-soft px-2 py-0.5 text-[10px] font-extrabold text-danger">
                  급매 1
                </span>
              </div>
              <div className="mt-1 text-xs text-text-2">
                1988년 · 1,486세대 · 용적률 199% · 재건축 여지 높음
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(false)}
              aria-label="패널 닫기"
              className="text-[15px] text-text-3"
            >
              ✕
            </button>
          </div>
          <div className="flex border-b border-[rgba(16,28,54,.06)] px-[22px]">
            {DETAIL_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDetailTab(t)}
                className={`px-3.5 py-[11px] text-[13px] ${
                  detailTab === t
                    ? "border-b-2 border-primary font-extrabold text-primary"
                    : "font-semibold text-text-2"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-[22px] py-4">
            {detailTab === "요약" && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="card rounded-xl px-3 py-[11px]">
                    <div className="text-[10px] text-text-3">시세 (84A)</div>
                    <div className="mt-0.5 text-base font-extrabold text-ink">8.4억</div>
                    <div className="delta-down text-[10px]">▼2.1% (3M)</div>
                  </div>
                  <div className="card rounded-xl px-3 py-[11px]">
                    <div className="text-[10px] text-text-3">24h 조회</div>
                    <div className="mt-0.5 text-base font-extrabold text-ink">412회</div>
                    <div className="text-[10px] text-text-3">관심 +18명</div>
                  </div>
                  <div className="card rounded-xl px-3 py-[11px]">
                    <div className="text-[10px] text-text-3">담당 전문가</div>
                    <div className="mt-0.5 text-base font-extrabold text-ink">3명</div>
                    <div className="text-[10px] text-text-3">중개 2 · 세무 1</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailTab("매물 12")}
                  className="flex items-center justify-between rounded-[14px] border-[1.5px] border-primary bg-surface px-[15px] py-[13px] text-left"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-danger-soft px-[7px] py-0.5 text-[10px] font-extrabold text-danger">
                        급매
                      </span>
                      <span className="text-sm font-extrabold text-ink">7.9억 · 5층 · 올수리</span>
                    </div>
                    <div className="mt-[3px] text-[11px] text-text-3">
                      시세 -6% · AI 적정가 8.2억 · 34명이 보는 중
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-primary">상세 ›</span>
                </button>
                <div className="card flex flex-col gap-[7px] rounded-[14px] px-[15px] py-[13px]">
                  <div className="flex justify-between">
                    <span className="text-xs font-extrabold text-ink">내 노트 판정</span>
                    <span className="text-xs font-extrabold text-primary">81점 · 5회 방문</span>
                  </div>
                  <div className="flex flex-wrap gap-[5px]">
                    <span className="chip bg-primary-soft px-2 py-[3px] text-[10px] text-primary">
                      학군 확정 강점
                    </span>
                    <span className="chip bg-primary-soft px-2 py-[3px] text-[10px] text-primary">
                      배수 양호
                    </span>
                    <span className="chip bg-danger-soft px-2 py-[3px] text-[10px] text-danger">
                      주차 확정 약점
                    </span>
                  </div>
                </div>
                <div className="ai-panel flex items-start gap-2.5 rounded-[14px] px-[15px] py-[13px]">
                  <span className="ai-chip h-5 w-5 text-[10px]">AI</span>
                  <div className="text-[11px] leading-[1.6] text-ai-text">
                    노트 5회 + 급매 출현 — 판단 단계 완료. 협상 전략(1차 7.75억)을 준비해
                    두었어요.
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/notes/compare"
                    className="btn-primary btn-cta flex-1 rounded-xl p-[11px] text-center text-xs"
                  >
                    비교에 담기
                  </Link>
                  <Link
                    href="/notes/new"
                    className="btn-secondary flex-1 rounded-xl p-[11px] text-center text-xs"
                  >
                    노트 쓰기
                  </Link>
                  <Link
                    href="/notifications"
                    className="btn-secondary flex-1 rounded-xl p-[11px] text-center text-xs"
                  >
                    알림 설정
                  </Link>
                </div>
              </>
            )}

            {detailTab === "매물 12" && (
              <>
                {/* 매물보기 (8e) */}
                <div className="flex items-center gap-1.5 text-[13px]">
                  <span className="chip chip-active px-3.5 py-2">매매 12</span>
                  <span className="chip bg-surface px-3.5 py-2 text-text-2">전세 7</span>
                  <span className="chip bg-[rgba(29,79,216,.12)] px-3.5 py-2 font-bold text-primary">
                    급매만
                  </span>
                  <span className="ml-auto text-[13px] text-text-3">낮은 가격순 ▾</span>
                </div>
                {LISTINGS.map((l) => (
                  <div
                    key={l.price}
                    className={`flex gap-3.5 rounded-[18px] bg-surface p-[18px] ${
                      l.urgent ? "border-[1.5px] border-primary" : "border border-line"
                    }`}
                  >
                    <div className="flex h-[80px] w-[96px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#e8edf5] to-[#f2f5fa] font-mono text-[10px] text-text-3">
                      매물 사진
                    </div>
                    <div className="flex flex-1 flex-col gap-[5px]">
                      <div className="flex items-center justify-between">
                        <span
                          className={`rounded-[5px] px-2 py-[3px] text-[11px] font-extrabold ${
                            l.urgent ? "bg-danger-soft text-danger" : "bg-[#f2f4f8] font-bold text-text-2"
                          }`}
                        >
                          {l.badge}
                        </span>
                        <span
                          className={`text-[11px] ${
                            l.urgent ? "font-bold text-primary" : "text-text-3"
                          }`}
                        >
                          {l.watching}
                        </span>
                      </div>
                      <div className="text-base font-extrabold text-ink">
                        {l.price}{" "}
                        {l.priceNote && (
                          <span className="text-xs font-bold text-primary">{l.priceNote}</span>
                        )}
                      </div>
                      <div className="text-xs text-text-2">{l.meta}</div>
                      <div className="flex gap-1.5">
                        {l.tags.map((t) => (
                          <span
                            key={t.label}
                            className={`chip px-2 py-[3px] text-[11px] ${
                              t.tone === "blue"
                                ? "bg-primary-soft text-primary"
                                : t.tone === "red"
                                  ? "bg-danger-soft text-danger"
                                  : "bg-[#f2f4f8] text-text-2"
                            }`}
                          >
                            {t.label}
                          </span>
                        ))}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <span className="text-[11px] text-text-3">{l.agent}</span>
                        <Link href="/notes/compare" className="text-xs font-bold text-primary">
                          내 노트와 비교 ›
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="ai-panel flex flex-col gap-2.5 rounded-[18px] p-[18px]">
                  <div className="flex items-center gap-2">
                    <span className="ai-chip h-5 w-5 text-[10px]">AI</span>
                    <span className="text-[13px] font-extrabold text-white">매물 읽기</span>
                  </div>
                  <div className="text-xs leading-[1.65] text-ai-text">
                    급매(7.9억)는 5층·올수리로 실질 가치가 높습니다. 최근 실거래(8.15억, 5층)
                    대비 <b className="text-ai-accent">-3% 수준의 진성 급매</b>로 판단됩니다.
                    34명이 함께 보고 있어 회전이 빠를 수 있어요.
                  </div>
                  <Link
                    href="/notes/new"
                    className="btn-primary rounded-[10px] p-2.5 text-center text-xs"
                  >
                    이 매물로 임장노트 시작
                  </Link>
                </div>
              </>
            )}

            {detailTab === "실거래" && (
              <div className="card flex flex-col rounded-[14px] px-[15px] py-2">
                {TRADES.map((t, i) => (
                  <div
                    key={t.date}
                    className={`flex items-center justify-between py-2.5 text-[13px] ${
                      i < TRADES.length - 1 ? "border-b border-[#f0f3f8]" : ""
                    }`}
                  >
                    <span className="text-text-2">
                      {t.date} · {t.floor}
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="font-extrabold text-ink">{t.price}</span>
                      <span className={`text-[11px] ${t.tone === "down" ? "delta-down" : "delta-up"}`}>
                        {t.delta}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {detailTab === "노트 15" && (
              <>
                {NOTES.map((n) => (
                  <div
                    key={n.title}
                    className="card flex items-center justify-between rounded-[14px] px-[15px] py-3.5"
                  >
                    <div>
                      <div className="text-[13px] font-bold text-ink">{n.title}</div>
                      <div className="mt-0.5 text-[11px] text-text-3">{n.author}</div>
                    </div>
                    <span className="text-xs font-extrabold text-primary">{n.score}</span>
                  </div>
                ))}
                <Link href="/notes" className="btn-soft rounded-xl p-3 text-center text-[13px]">
                  공개 노트 15개 모두 보기
                </Link>
              </>
            )}

            {detailTab === "이야기" && (
              <>
                <div className="card rounded-[14px] px-[15px] py-3.5">
                  <div className="text-[13px] font-bold text-ink">
                    공작 재건축 추진위 실체가 있나요?
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-3">
                    질문 · 댓글 9 · 김OO 중개사 채택 답변
                  </div>
                </div>
                <Link href="/town" className="btn-soft rounded-xl p-3 text-center text-[13px]">
                  동네이야기 더 보기
                </Link>
              </>
            )}
          </div>
        </aside>
      )}

      {/* ===== 우하단 줌 컨트롤 ===== */}
      <div className="absolute bottom-[88px] right-5 z-30 flex flex-col gap-1.5">
        <button
          type="button"
          aria-label="확대"
          className="glass flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-[15px] text-text-1"
        >
          ＋
        </button>
        <button
          type="button"
          aria-label="축소"
          className="glass flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-[15px] text-text-1"
        >
          －
        </button>
        <button
          type="button"
          aria-label="현재 위치"
          className="glass flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-[13px] text-primary"
        >
          ◎
        </button>
      </div>

      {/* ===== 범례 ===== */}
      <div className="glass absolute bottom-5 right-5 z-30 hidden gap-3.5 rounded-xl px-3.5 py-[9px] md:flex">
        <div className="flex items-center gap-1.5 text-[11px] text-text-1">
          <span className="h-[9px] w-[9px] rounded-[3px] bg-primary" />
          임장한 단지
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-text-1">
          <span className="h-[9px] w-[9px] rounded-[3px] border border-[#c3cad6] bg-surface" />
          미방문
        </div>
      </div>

      {/* ===== 중앙 하단 플로팅 카테고리 바 ===== */}
      <nav className="glass-strong absolute bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1.5">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-full px-4 py-[9px] text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary"
        >
          <HomeIcon />홈
        </Link>
        <Link
          href="/notes"
          className="rounded-full px-4 py-[9px] text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary"
        >
          임장노트
        </Link>
        <span className="rounded-full bg-[rgba(29,79,216,.12)] px-4 py-[9px] text-[13px] font-bold text-primary">
          지도
        </span>
        <Link
          href="/analysis"
          className="hidden rounded-full px-4 py-[9px] text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary md:block"
        >
          AI 분석
        </Link>
        <Link
          href="/town"
          className="hidden rounded-full px-4 py-[9px] text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary md:block"
        >
          동네이야기
        </Link>
      </nav>
    </div>
  );
}
