"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";

/* P1-13 설정 실배선: 장식이던 알림 토글을 /api/me/notification-prefs GET/PATCH에
   연결(낙관적 업데이트 + 실패 시 롤백). 저장 API가 없는 항목은 지어내지 않고
   "준비 중"으로 정직하게 표기, 가짜 구독·결제 정보는 실링크로 교체 */

type TabKey = "account" | "notification" | "privacy";

const TABS: { key: TabKey; label: string }[] = [
  { key: "account", label: "계정 · 구독" },
  { key: "notification", label: "알림" },
  { key: "privacy", label: "공개범위 · 프라이버시" },
];

/* /api/me/notification-prefs 의 실제 컬럼과 1:1 매핑 */
type PrefKey =
  | "emailComments"
  | "emailLikes"
  | "emailMeeting"
  | "emailExpert"
  | "emailMarketing"
  | "pushComments"
  | "pushLikes"
  | "pushMeeting"
  | "pushExpert";

type Prefs = Record<PrefKey, boolean>;

const PREF_GROUPS: {
  title: string;
  rows: { key: PrefKey; label: string; desc?: string }[];
}[] = [
  {
    title: "이메일 알림",
    rows: [
      { key: "emailComments", label: "댓글 · 답글", desc: "내 글·노트에 반응이 달리면" },
      { key: "emailLikes", label: "좋아요 · 저장" },
      { key: "emailMeeting", label: "임장 모임 · 모임 채팅", desc: "새 메시지 · 일정 변경" },
      { key: "emailExpert", label: "전문가 상담 답변" },
      { key: "emailMarketing", label: "마케팅 · 소식", desc: "혜택 · 새 기능 안내 (선택)" },
    ],
  },
  {
    title: "푸시 알림",
    rows: [
      { key: "pushComments", label: "댓글 · 답글" },
      { key: "pushLikes", label: "좋아요 · 저장" },
      { key: "pushMeeting", label: "임장 모임 · 모임 채팅" },
      { key: "pushExpert", label: "전문가 상담 답변" },
    ],
  },
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

/* ---------------- 알림 탭 — 실배선 ---------------- */
function NotificationTab() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "guest" | "error">(
    "loading",
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/notification-prefs", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 401) {
          setPhase("guest");
          return;
        }
        if (!res.ok) {
          setPhase("error");
          return;
        }
        const data = (await res.json()) as { prefs?: Prefs };
        if (!data.prefs) {
          setPhase("error");
          return;
        }
        setPrefs(data.prefs);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (key: PrefKey) => {
      if (!prefs) return;
      const next = !prefs[key];
      /* 낙관적 업데이트 */
      setPrefs({ ...prefs, [key]: next });
      setSaveError(null);
      try {
        const res = await fetch("/api/me/notification-prefs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: next }),
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { prefs?: Prefs };
        if (data.prefs) setPrefs(data.prefs);
      } catch {
        /* 실패 시 롤백 */
        setPrefs((p) => (p ? { ...p, [key]: !next } : p));
        setSaveError("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    },
    [prefs],
  );

  if (phase === "loading") {
    return (
      <div className="card rounded-2xl px-4 py-8 text-center text-[13px] text-text-3">
        알림 설정을 불러오는 중…
      </div>
    );
  }

  if (phase === "guest") {
    return (
      <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
        <div className="text-[13px] font-extrabold text-ink">
          로그인하면 알림 설정을 저장할 수 있어요
        </div>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent("/my/settings")}`}
          className="btn-primary rounded-xl px-5 py-2.5 text-[13px] no-underline"
        >
          로그인
        </Link>
      </div>
    );
  }

  if (phase === "error" || !prefs) {
    return (
      <div className="card rounded-2xl px-4 py-8 text-center text-[13px] text-text-3">
        설정을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {saveError && (
        <div className="rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">
          {saveError}
        </div>
      )}
      {PREF_GROUPS.map((group) => (
        <div key={group.title} className="card flex flex-col rounded-2xl px-4 py-1">
          <div className="pb-1 pt-3 text-[11px] font-extrabold text-text-3">
            {group.title}
          </div>
          {group.rows.map((row, i) => (
            <button
              key={row.key}
              type="button"
              role="switch"
              aria-checked={prefs[row.key]}
              onClick={() => void toggle(row.key)}
              className={`flex w-full items-center justify-between py-[11px] text-left ${
                i < group.rows.length - 1 ? "border-b border-[#f0f3f8]" : ""
              }`}
            >
              <span>
                <span className="block text-[13px] font-semibold text-text-1">
                  {row.label}
                </span>
                {row.desc && (
                  <span className="block text-[10px] text-text-3">{row.desc}</span>
                )}
              </span>
              <Toggle on={prefs[row.key]} />
            </button>
          ))}
        </div>
      ))}
      <div className="text-[10px] text-text-3">
        변경 즉시 저장돼요 · 방해 금지 시간 등 세부 옵션은 준비 중이에요
      </div>
    </div>
  );
}

/* ---------------- 공개범위 탭 — 저장 API 없는 항목은 정직하게 안내 ---------------- */
function PrivacyTab() {
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-2 rounded-2xl p-4">
        <div className="text-[13px] font-extrabold text-ink">노트 공개 범위</div>
        <p className="text-xs leading-[1.6] text-text-2">
          공개 여부는 노트 작성·수정 화면에서 노트별로 설정할 수 있어요. 계정
          단위 기본값 설정은 준비 중이에요.
        </p>
        <Link
          href="/notes"
          className="btn-soft mt-1 rounded-[10px] p-2.5 text-center text-xs no-underline"
        >
          내 노트에서 공개 설정하기
        </Link>
      </div>

      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="flex items-center justify-between border-b border-[#f0f3f8] py-3">
          <div>
            <div className="text-[13px] font-semibold text-text-1">
              공개 노트에 동·호수 가림
            </div>
            <div className="text-[10px] text-text-3">항상 켜짐 · 해제 불가</div>
          </div>
          <span className="text-[11px] font-bold text-text-3">고정</span>
        </div>
        {["프로필 공개 범위", "차단 목록 관리", "내 데이터 다운로드"].map(
          (label, i, arr) => (
            <div
              key={label}
              className={`flex items-center justify-between py-3 ${
                i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
              }`}
            >
              <span className="text-[13px] font-semibold text-text-1">{label}</span>
              <span className="text-[11px] font-bold text-text-3">준비 중</span>
            </div>
          ),
        )}
      </div>

      <div className="card flex flex-col gap-1.5 rounded-2xl p-4">
        <div className="text-[13px] font-extrabold text-ink">개인정보 처리</div>
        <p className="text-xs leading-[1.6] text-text-2">
          열람·정정·삭제 요청은 개인정보 처리방침의 절차를 따라요.
        </p>
        <div className="flex gap-2 text-xs">
          <Link href="/legal/privacy" className="font-bold text-primary no-underline">
            개인정보처리방침 ›
          </Link>
          <Link
            href="/legal/privacy-request"
            className="font-bold text-primary no-underline"
          >
            열람·삭제 요청 ›
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 계정 탭 — 가짜 구독·결제 정보 제거, 실링크로 교체 ---------------- */
function AccountTab() {
  return (
    <div className="flex flex-col gap-3">
      <div className="ai-panel flex flex-col gap-2.5 rounded-2xl p-4">
        <div className="text-[13px] font-extrabold text-white">구독 관리</div>
        <p className="text-xs leading-[1.6] text-ai-text">
          현재 플랜·다음 결제일·결제 수단은 구독 페이지에서 확인하고 변경할 수
          있어요. 해지·재개도 같은 곳에서 바로 처리돼요.
        </p>
        <Link
          href="/subscription"
          className="btn-primary rounded-[10px] p-2.5 text-center text-xs no-underline"
        >
          플랜 · 결제 관리
        </Link>
      </div>

      <div className="card flex flex-col rounded-2xl px-4 py-1">
        {[
          { label: "프로필 · 활동 관리", href: "/my" },
          { label: "구독 · 결제", href: "/subscription" },
          { label: "고객센터 · 문의", href: "/support" },
          { label: "법적 고지 · 약관", href: "/legal" },
        ].map((row, i, arr) => (
          <Link
            key={row.label}
            href={row.href}
            className={`flex justify-between py-3 text-[13px] font-semibold text-text-1 no-underline ${
              i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
            }`}
          >
            <span>{row.label}</span>
            <span className="text-[#c3cad6]">›</span>
          </Link>
        ))}
      </div>

      {/* 데이터 내보내기 — 기능 미구현: 지어내지 않고 준비 중 표기 */}
      <div className="card flex flex-col gap-1.5 rounded-[20px] p-[18px]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-extrabold text-ink">
            내 데이터 내보내기
          </span>
          <span className="text-[11px] font-bold text-text-3">준비 중</span>
        </div>
        <p className="text-[11px] leading-[1.6] text-text-2">
          임장노트 전체(PDF·ZIP)와 비교 데이터를 내려받는 기능을 준비하고
          있어요. 그 전에는 고객센터로 요청하면 도와드려요.
        </p>
      </div>

      <div className="text-center text-xs text-[#adb5bd]">
        {/* API 라우트 전체 내비게이션 필요 — HeaderAuth와 동일 패턴 */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/auth/signout" className="font-semibold text-text-2 no-underline">
          로그아웃
        </a>{" "}
        · 회원탈퇴는{" "}
        <Link href="/support" className="text-danger no-underline">
          고객센터
        </Link>
        를 통해 처리돼요 (노트는 30일 보관 후 삭제)
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
