"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";

type TabKey = "account" | "notification" | "privacy";

const TABS: { key: TabKey; label: string }[] = [
  { key: "account", label: "계정 · 구독" },
  { key: "notification", label: "알림" },
  { key: "privacy", label: "공개범위 · 프라이버시" },
];

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors ${
        on ? "bg-primary" : "bg-[#e2e7ee]"
      }`}
      aria-hidden="true"
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,.2)] transition-all ${
          on ? "right-0.5" : "left-0.5"
        }`}
      />
    </span>
  );
}

function ToggleRow({
  label,
  desc,
  initial,
  last = false,
}: {
  label: string;
  desc?: string;
  initial: boolean;
  last?: boolean;
}) {
  const [on, setOn] = useState(initial);
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      className={`flex w-full items-center justify-between py-[11px] text-left ${
        last ? "" : "border-b border-[#f0f3f8]"
      }`}
    >
      <span>
        <span className="block text-[13px] font-semibold text-text-1">{label}</span>
        {desc && <span className="block text-[10px] text-text-3">{desc}</span>}
      </span>
      <Toggle on={on} />
    </button>
  );
}

/* ---------------- 알림 탭 (9l 알림 상세 + 12l 알림 피로도) ---------------- */
function NotificationTab() {
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 text-[11px] font-extrabold text-text-3">시세 · 매물</div>
        <ToggleRow label="관심 단지 급매 등록" desc="시세 대비 -3% 이하 즉시" initial />
        <ToggleRow label="시세 변동" desc="±2% 이상 변동 시 · 주 1회 요약" initial />
        <ToggleRow label="매수 신호 도달 (70점)" desc="타이밍 분석 연동" initial last />
      </div>
      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 text-[11px] font-extrabold text-text-3">청약</div>
        <ToggleRow label="관심지역 신규 공고" initial />
        <ToggleRow label="접수 마감 D-3" initial={false} last />
      </div>
      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 text-[11px] font-extrabold text-text-3">커뮤니티 · 쪽지</div>
        <ToggleRow label="댓글 · 답글" initial={false} />
        <ToggleRow label="새 쪽지 · 모임 채팅" initial last />
      </div>
      <div className="card flex items-center justify-between rounded-2xl px-4 py-3">
        <span className="text-[13px] font-semibold text-text-1">방해 금지 시간</span>
        <span className="text-xs font-bold text-primary">22:00 – 08:00 ▾</span>
      </div>

      {/* 알림 피로도 제어 (12l) */}
      <div className="card flex flex-col gap-2.5 rounded-[20px] p-[18px]">
        <div className="text-[13px] font-extrabold text-ink">알림 피로도 제어</div>
        {[
          { label: "매물 변동", active: "즉시" },
          { label: "커뮤니티·채팅", active: "하루 1회" },
          { label: "마케팅", active: "끔" },
        ].map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-[9px] bg-bg px-3 py-2"
          >
            <span className="text-[11px] font-bold text-text-1">{row.label}</span>
            <span className="flex gap-1">
              {["즉시", "하루 1회", "끔"].map((opt) => (
                <span
                  key={opt}
                  className={`rounded-full px-2 py-[3px] text-[9px] ${
                    opt === row.active ? "bg-ink font-bold text-white" : "text-text-3"
                  }`}
                >
                  {opt}
                </span>
              ))}
            </span>
          </div>
        ))}
        <div className="rounded-[10px] bg-[rgba(29,79,216,.06)] px-3 py-2 text-[10px] font-bold text-primary">
          이번 주 알림 23건 → 묶음 모드면 4건으로 줄어요
        </div>
      </div>
    </div>
  );
}

/* ---------------- 공개범위 탭 (9l 공개 범위 · 프라이버시) ---------------- */
function PrivacyTab() {
  const [scope, setScope] = useState("비공개");
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-2.5 rounded-2xl p-4">
        <div className="text-[13px] font-extrabold text-ink">노트 기본 공개 범위</div>
        <div className="flex gap-1.5">
          {["비공개", "링크 공유", "전체 공개"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`flex-1 rounded-[10px] p-2 text-xs ${
                scope === s
                  ? "border-[1.5px] border-primary bg-primary-soft font-bold text-primary"
                  : "border border-[#e2e7ee] bg-surface text-text-2"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-text-3">새 노트에 적용되는 기본값 · 노트별로 변경 가능</div>
      </div>

      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="flex items-center justify-between border-b border-[#f0f3f8] py-3">
          <div>
            <div className="text-[13px] font-semibold text-text-1">공개 노트에 동·호수 가림</div>
            <div className="text-[10px] text-text-3">항상 켜짐 · 해제 불가</div>
          </div>
          <span className="text-[11px] font-bold text-text-3">고정</span>
        </div>
        <ToggleRow label="프로필에 구독 배지 표시" initial />
        <div className="flex items-center justify-between border-b border-[#f0f3f8] py-3">
          <span className="text-[13px] font-semibold text-text-1">쪽지 수신 허용</span>
          <span className="text-xs font-bold text-primary">전체 ▾</span>
        </div>
        <ToggleRow label="활동 통계 공개 (노트 수 등)" initial={false} last />
      </div>

      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="flex justify-between border-b border-[#f0f3f8] py-3 text-[13px] font-semibold text-text-1">
          <span>차단 목록</span>
          <span className="font-medium text-text-3">2명 ›</span>
        </div>
        <div className="flex justify-between py-3 text-[13px] font-semibold text-text-1">
          <span>내 데이터 다운로드</span>
          <span className="text-[#c3cad6]">›</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 계정 탭 (9l 계정·구독 + 12l 해지/일시정지·내보내기·글자크기) ---------------- */
function AccountTab() {
  const [fontStep, setFontStep] = useState(1);
  const fontLabels = ["기본", "크게", "더 크게", "최대"];
  return (
    <div className="flex flex-col gap-3">
      <div className="ai-panel flex flex-col gap-2.5 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[rgba(126,162,255,.14)] px-2 py-[3px] text-[10px] font-extrabold text-[#7ea2ff]">
            ✦ 플러스 이용 중
          </span>
          <span className="text-[11px] text-ai-muted">연간 결제</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-ai-muted">다음 결제일</span>
          <span className="font-bold text-white">2027.03.14 · 34,800원</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-ai-muted">결제 수단</span>
          <span className="font-bold text-white">신한카드 ···· 4821 변경 ›</span>
        </div>
        <div className="flex gap-2">
          <Link
            href="/subscription"
            className="btn-primary flex-1 rounded-[10px] p-2.5 text-center text-xs"
          >
            프로로 업그레이드
          </Link>
          <span className="flex-1 rounded-[10px] border border-[rgba(255,255,255,.12)] bg-[rgba(255,255,255,.08)] p-2.5 text-center text-xs font-bold text-ai-text">
            해지
          </span>
        </div>
      </div>

      <div className="card flex flex-col rounded-2xl px-4 py-1">
        {[
          { label: "연결된 계정", value: "카카오 ›" },
          { label: "닉네임 · 프로필 수정", value: "›" },
          { label: "결제 내역 · 영수증", value: "›" },
          { label: "구매한 리포트 · 상품", value: "3건 ›" },
        ].map((row, i, arr) => (
          <div
            key={row.label}
            className={`flex justify-between py-3 text-[13px] font-semibold text-text-1 ${
              i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
            }`}
          >
            <span>{row.label}</span>
            <span className={row.value === "›" ? "text-[#c3cad6]" : "font-medium text-text-3"}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* 해지 · 일시정지 (12l — 다크패턴 없음) */}
      <div className="card flex flex-col gap-2.5 rounded-[20px] p-[18px]">
        <div className="text-[13px] font-extrabold text-ink">해지 · 일시정지</div>
        <div className="text-[11px] text-text-2">플러스 구독 · 다음 결제 2027.03.14</div>
        <div className="rounded-xl border-[1.5px] border-primary bg-[rgba(29,79,216,.04)] p-3">
          <div className="text-xs font-extrabold text-primary">3개월 일시정지</div>
          <div className="mt-[3px] text-[10px] text-text-2">결제 중단 · 데이터·설정 그대로 보관</div>
        </div>
        <div className="rounded-xl border border-line p-3">
          <div className="text-xs font-extrabold text-ink">바로 해지</div>
          <div className="mt-[3px] text-[10px] text-text-2">
            1단계 확인 후 즉시 처리 · 남은 기간은 계속 이용
          </div>
        </div>
        <div className="text-[10px] text-text-3">설문은 해지 완료 후 선택 사항 · 해지 버튼 숨김 금지</div>
      </div>

      {/* 내 데이터 내보내기 (12l) */}
      <div className="card flex flex-col gap-2.5 rounded-[20px] p-[18px]">
        <div className="text-[13px] font-extrabold text-ink">내 데이터 내보내기</div>
        {[
          { label: "임장노트 전체 (사진 포함)", fmt: "PDF · ZIP" },
          { label: "비교·평가 데이터", fmt: "Excel" },
          { label: "계약 일정·문서 목록", fmt: "PDF" },
        ].map((row) => (
          <div
            key={row.label}
            className="flex justify-between rounded-[9px] bg-bg px-3 py-2 text-[11px] text-text-1"
          >
            <span>{row.label}</span>
            <b className="text-primary">{row.fmt}</b>
          </div>
        ))}
        <div className="text-[10px] text-text-3">준비되면 메일 발송 (최대 10분)</div>
      </div>

      {/* 글자 크기 설정 (12l) */}
      <div className="card flex flex-col gap-2.5 rounded-[20px] p-[18px]">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-extrabold text-ink">글자 크기 설정</span>
          <span className="text-[11px] font-bold text-primary">{fontLabels[fontStep]}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-text-3">가</span>
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={fontStep}
            onChange={(e) => setFontStep(Number(e.target.value))}
            className="flex-1 accent-[#1d4fd8]"
            aria-label="글자 크기"
          />
          <span className="text-xl font-bold text-ink">가</span>
        </div>
        <div className="rounded-xl bg-bg p-3">
          <div
            className="font-extrabold text-ink"
            style={{ fontSize: 14 + fontStep * 2 }}
          >
            공작 84A 전세 4.9억
          </div>
          <div className="mt-[3px] text-[13px] text-text-2">
            크게 보기 미리보기 · 어제보다 3,000만 내렸어요
          </div>
        </div>
        <div className="text-[10px] text-text-3">
          4단계 (기본·크게·더 크게·최대) · 시스템 크기 따르기 지원 · 카드 레이아웃 자동 재배치
        </div>
      </div>

      <div className="text-center text-xs text-[#adb5bd]">
        로그아웃 · <span className="text-danger">회원탈퇴</span> (노트는 30일 보관 후 삭제)
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("account");
  return (
    <PageShell title="설정" breadcrumb="마이 › 설정">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
        <div className="rise-in flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`chip px-3.5 py-2 text-[13px] ${
                tab === t.key ? "chip-active" : "border border-[#e2e7ee] bg-surface text-text-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="rise-in-1">
          {tab === "account" && <AccountTab />}
          {tab === "notification" && <NotificationTab />}
          {tab === "privacy" && <PrivacyTab />}
        </div>
      </div>
    </PageShell>
  );
}
