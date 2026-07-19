"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";

/* 시안 16g 일반(무료) 사용자 대시보드 + 16h 구독(PRO) 사용자 대시보드
   — 탭 토글로 두 상태를 전환 (모바일 + 데스크탑) */

export type RecentPublicNote = {
  id: string;
  title: string;
  meta: string;
};

type Props = {
  /** 커뮤니티 공개 노트 수 (실데이터, 실패 시 null) */
  publicNoteCount: number | null;
  /** 최근 공개 노트 2건 (실데이터, 없으면 목업 사용) */
  recentPublicNotes: RecentPublicNote[];
};

/* ---------- 목업 상수 (시안 문구 그대로) ---------- */

const FREE_STATS = [
  { value: "4", label: "내 노트" },
  { value: "7", label: "찜 매물" },
  { value: "2", label: "관심 지역" },
] as const;

const FREE_ACTIVITY_MOCK = [
  { title: "공작 302동 · 3차", meta: "어제 · 체크 18/24" },
  { title: "한가람 1204 · 1차", meta: "지난주" },
] as const;

const PRO_USAGE = [
  { label: "AI 분석", pct: 40, value: "12/30", bar: "bg-primary" },
  { label: "상세 리포트", pct: 33, value: "1/3", bar: "bg-primary" },
  { label: "저장공간", pct: 62, value: "6.2/10GB", bar: "bg-[#7ea2ff]" },
] as const;

const PRO_STATS = [
  { value: "47", label: "전체 노트 (무제한 이력)", tone: "text-ink" },
  { value: "8", label: "알림 조건 /10", tone: "text-ink" },
  { value: "72%", label: "판단 적중률", tone: "text-[#1a7f4e]" },
] as const;

function ProBadge({ suffix }: { suffix?: string }) {
  return (
    <span className="rounded-full bg-[rgba(25,31,40,.94)] px-2.5 py-1 text-[10px] font-extrabold text-[#f2c94c]">
      ✦ 프로{suffix ? ` · ${suffix}` : ""}
    </span>
  );
}

function AdSlot({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-[#e2e7ee] bg-surface px-4 py-3">
      <span className="rounded bg-[#f0f3f8] px-1.5 py-0.5 text-[9px] font-extrabold text-text-3">
        AD
      </span>
      <span className="text-[11px] text-text-3">{text}</span>
    </div>
  );
}

/* ---------- 16g 무료 대시보드 ---------- */

function FreeView({ publicNoteCount, recentPublicNotes }: Props) {
  const activity =
    recentPublicNotes.length >= 2
      ? recentPublicNotes.map((n) => ({ title: n.title, meta: n.meta }))
      : FREE_ACTIVITY_MOCK.map((a) => ({ ...a }));

  return (
    <>
      {/* ===== 모바일 (16g 390px 프레임) ===== */}
      <section className="flex flex-col gap-2.5 md:hidden">
        <div className="rise-in flex gap-2">
          {FREE_STATS.map((s) => (
            <div key={s.label} className="card flex-1 rounded-[14px] p-3 text-center">
              <div className="text-lg font-extrabold text-ink">{s.value}</div>
              <div className="text-[11px] text-text-3">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="rise-in-1 card flex flex-col gap-1.5 rounded-[14px] p-[13px]">
          <div className="flex justify-between text-[13px]">
            <span className="font-extrabold text-ink">이번 달 AI 분석</span>
            <span className="text-text-3">1/1회 사용</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-[#eef1f6]">
            <span className="block h-full w-full bg-[#8b95a1]" />
          </div>
          <div className="text-[11px] text-text-3">
            무료 1회 소진 · 다음 달 1일 초기화 ·{" "}
            <Link href="/subscription" className="font-bold text-primary">
              PRO는 월 30회 ›
            </Link>
          </div>
        </div>

        <div className="rise-in-2 card flex items-center justify-between rounded-[14px] p-[13px]">
          <div>
            <div className="text-[13px] font-extrabold text-ink">공작 84A 전세</div>
            <div className="text-[11px] font-bold text-[#1a7f4e]">4.9억 ▼3,000 · 어제</div>
          </div>
          <Link href="/notes" className="text-xs font-bold text-primary">
            노트 열기 ›
          </Link>
        </div>

        {publicNoteCount !== null && (
          <Link
            href="/notes"
            className="rise-in-3 card card-hover flex items-center justify-between rounded-[14px] px-4 py-3"
          >
            <span className="text-[13px] font-bold text-ink">
              커뮤니티 공개 노트{" "}
              <span className="font-extrabold text-primary">{publicNoteCount}건</span>
            </span>
            <span className="text-xs font-bold text-primary">둘러보기 ›</span>
          </Link>
        )}

        <div className="rise-in-3">
          <AdSlot text="광고 슬롯 — PRO는 제거" />
        </div>
      </section>

      {/* ===== 데스크탑 (16g 860px 프레임) ===== */}
      <section className="hidden flex-col gap-4 md:flex">
        <div className="rise-in flex items-center justify-between px-1">
          <span className="text-[13px] text-text-3">대시보드 · 무료</span>
          <Link
            href="/subscription"
            className="btn-primary rounded-[9px] px-3.5 py-[7px] text-xs font-bold"
          >
            PRO 시작
          </Link>
        </div>

        <div className="rise-in-1 grid grid-cols-3 gap-3">
          <div className="card col-span-2 flex flex-col gap-2 rounded-2xl p-4">
            <div className="text-sm font-extrabold text-ink">
              내 활동{" "}
              <span className="text-[11px] font-medium text-text-3">
                노트 4 · 찜 7 · 비교 1
              </span>
            </div>
            <div className="flex gap-2 text-xs">
              {activity.map((a) => (
                <div key={a.title} className="flex-1 rounded-[10px] bg-bg p-2.5">
                  <div className="font-bold text-ink">{a.title}</div>
                  <div className="mt-0.5 text-text-3">{a.meta}</div>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-text-3">
              최근 30일 이력만 표시 ·{" "}
              <Link href="/subscription" className="font-bold text-primary">
                전체 이력은 PRO
              </Link>
              {publicNoteCount !== null && (
                <>
                  {" "}
                  · 커뮤니티 공개 노트{" "}
                  <Link href="/notes" className="font-bold text-primary">
                    {publicNoteCount}건 ›
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="card flex flex-col gap-2 rounded-2xl p-4">
            <div className="text-sm font-extrabold text-ink">알림 조건 1/1</div>
            <div className="rounded-[9px] bg-bg px-2.5 py-2 text-xs text-text-1">
              공작 84A 전세 5억 이하
            </div>
            <div className="text-[11px] text-text-3">추가 조건은 PRO (10개)</div>
          </div>

          <div className="col-span-3">
            <AdSlot text="피드 광고 슬롯 (애드센스 규칙 준수 — 작성·AI 결론 화면에는 없음)" />
          </div>
        </div>
      </section>
    </>
  );
}

/* ---------- 16h PRO 대시보드 ---------- */

function ProView() {
  return (
    <>
      {/* ===== 모바일 (16h 390px 프레임) ===== */}
      <section className="flex flex-col gap-2.5 md:hidden">
        <div className="rise-in flex items-center justify-between px-0.5">
          <span className="text-[13px] text-text-3">대시보드</span>
          <ProBadge />
        </div>

        <div className="rise-in-1 card flex flex-col gap-2 rounded-[14px] p-[13px]">
          <div className="flex justify-between text-[13px]">
            <span className="font-extrabold text-ink">이번 달 사용량</span>
            <span className="text-text-3">갱신 8/2</span>
          </div>
          <div className="flex flex-col gap-1.5 text-[11px] text-text-2">
            {PRO_USAGE.map((u) => (
              <div key={u.label} className="flex items-center gap-2">
                <span className="w-[72px] shrink-0">{u.label}</span>
                <div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-[#eef1f6]">
                  <span
                    className={`block h-full ${u.bar}`}
                    style={{ width: `${u.pct}%` }}
                  />
                </div>
                <span className="tabular-nums">{u.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rise-in-2 rounded-[14px] bg-[rgba(25,31,40,.96)] px-[15px] py-[13px] text-xs leading-relaxed text-[#e2e8f2]">
          <b className="text-[#7ea2ff]">주간 인사이트</b> — 관양동 전세 -0.3%. 찜 매물
          2건이 적정가 도달, 협상 타이밍이에요.
        </div>

        <div className="rise-in-3 flex gap-2">
          {PRO_STATS.map((s) => (
            <div key={s.label} className="card flex-1 rounded-[14px] p-[11px] text-center">
              <div className={`text-[15px] font-extrabold ${s.tone}`}>{s.value}</div>
              <div className="mt-0.5 text-[10px] text-text-3">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="rise-in-4 flex gap-1.5">
          <Link
            href="/analysis"
            className="btn-primary flex-1 rounded-[10px] p-2.5 text-center text-xs font-bold"
          >
            AI 분석 실행
          </Link>
          <button
            type="button"
            className="btn-secondary flex-1 rounded-[10px] p-2.5 text-center text-xs font-bold"
          >
            PDF·CSV 내보내기
          </button>
        </div>
      </section>

      {/* ===== 데스크탑 (16h 860px 프레임) ===== */}
      <section className="hidden flex-col gap-4 md:flex">
        <div className="rise-in flex items-center justify-between px-1">
          <span className="text-[13px] text-text-3">대시보드</span>
          <ProBadge suffix="갱신 8/2" />
        </div>

        <div className="rise-in-1 grid grid-cols-[1.3fr_1fr_1fr] gap-3">
          <div className="card flex flex-col gap-2 rounded-2xl p-4">
            <div className="text-sm font-extrabold text-ink">
              포트폴리오 흐름{" "}
              <span className="text-[11px] font-medium text-text-3">
                장기 이력 · PRO 전용
              </span>
            </div>
            <svg
              width="100%"
              height="52"
              viewBox="0 0 300 52"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M0 40 C 50 36, 90 38, 130 28 S 230 14, 300 10 L300 22 C 230 26, 170 30, 130 36 S 50 46, 0 46 Z"
                fill="rgba(29,79,216,.1)"
              />
              <polyline
                points="0,43 60,40 120,32 180,26 240,18 300,15"
                fill="none"
                stroke="#1d4fd8"
                strokeWidth="2"
              />
            </svg>
            <div className="flex justify-between text-[11px] text-text-3">
              <span>24개월 이력</span>
              <span className="font-bold text-primary">자산 4.2억 · 상환 잔여 27년</span>
            </div>
          </div>

          <div className="card flex flex-col gap-1.5 rounded-2xl p-4">
            <div className="text-sm font-extrabold text-ink">후보 비교 3건</div>
            <div className="rounded-[9px] bg-bg px-2.5 py-2 text-xs text-text-1">
              <b className="text-primary">공작 84A</b> vs 한가람 vs 동편3
            </div>
            <Link href="/notes/compare" className="text-[11px] text-text-3">
              레이더 비교 · CSV 내보내기
            </Link>
          </div>

          <div className="card flex flex-col gap-1.5 rounded-2xl p-4">
            <div className="text-sm font-extrabold text-ink">관심지역 알림 8/10</div>
            <div className="rounded-[9px] bg-bg px-2.5 py-2 text-xs text-text-1">
              이번 주 매칭 5건 · 새 매물 2
            </div>
            <Link href="/notifications" className="text-[11px] font-bold text-primary">
              조건 관리 ›
            </Link>
          </div>

          <div className="card col-span-3 flex items-center justify-between rounded-[14px] px-4 py-3 text-xs">
            <span className="text-text-1">
              <b>구독 관리</b> — 월 19,000원 · 다음 결제 8/2 · 결제수단 카드 ***4512
            </span>
            <span className="flex gap-2.5">
              <Link href="/subscription" className="font-bold text-primary">
                플랜 변경
              </Link>
              <Link href="/subscription" className="text-text-3">
                일시정지·해지
              </Link>
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

/* ---------- 셸 + 탭 토글 ---------- */

export function DashboardClient(props: Props) {
  const [tab, setTab] = useState<"free" | "pro">("free");

  return (
    <PageShell breadcrumb="마이 › 내 대시보드">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">내 대시보드</h1>
        <div className="flex gap-1.5" role="tablist" aria-label="구독 상태 미리보기">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "free"}
            onClick={() => setTab("free")}
            className={tab === "free" ? "chip chip-active" : "chip"}
          >
            무료
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pro"}
            onClick={() => setTab("pro")}
            className={tab === "pro" ? "chip chip-active" : "chip"}
          >
            ✦ PRO 미리보기
          </button>
        </div>
      </div>

      {tab === "free" ? <FreeView {...props} /> : <ProView />}
    </PageShell>
  );
}
