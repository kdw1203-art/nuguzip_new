"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { useToast } from "@/app/components/toast/ToastProvider";

/* 설정 (item 14) — 진짜 설정만 유지, 네비게이션성 항목 제거.
   섹션: 계정 · 알림 · 개인정보. 저장되는 토글만 실배선(/api/me/notification-prefs),
   저장 API 없는 항목은 지어내지 않고 링크·정직한 안내로 대체. */

type TabKey = "account" | "notification" | "privacy";

const TABS: { key: TabKey; label: string }[] = [
  { key: "account", label: "계정" },
  { key: "notification", label: "알림" },
  { key: "privacy", label: "개인정보" },
];

/* /api/me/notification-prefs 의 실제 컬럼과 1:1 매핑 (마케팅은 개인정보 탭에서 별도 노출) */
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

type Prefs = Record<PrefKey, boolean> & {
  /** SMS(NCP SENS) 관심단지 가격 알림 — 별도 카드에서 관리 */
  alertPhone?: string | null;
  smsPriceAlerts?: boolean;
};

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

/* SMS(문자) 알림 옵트인 — 관심단지 가격 변동을 NCP SENS 문자로 수신.
   전화번호 저장 + 토글 + 동의 문구. 저장 시 토스트. */
function SmsAlertCard({
  initialPhone,
  initialOn,
}: {
  initialPhone: string | null;
  initialOn: boolean;
}) {
  const { showToast } = useToast();
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [savedPhone, setSavedPhone] = useState<string | null>(initialPhone);
  const [on, setOn] = useState(initialOn);
  const [busy, setBusy] = useState(false);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = /^01\d{8,9}$/.test(digits);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/me/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        prefs?: { alertPhone?: string | null; smsPriceAlerts?: boolean };
      };
      if (data.prefs) {
        setSavedPhone(data.prefs.alertPhone ?? null);
        setOn(Boolean(data.prefs.smsPriceAlerts));
      }
      return true;
    } catch {
      showToast("저장에 실패했어요. 잠시 후 다시 시도해 주세요");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function savePhone() {
    if (!phoneValid) {
      showToast("올바른 휴대폰 번호를 입력해 주세요");
      return;
    }
    if (await patch({ alertPhone: digits })) showToast("번호를 저장했어요");
  }

  async function toggle() {
    if (busy) return;
    if (!on) {
      if (!savedPhone && !phoneValid) {
        showToast("먼저 휴대폰 번호를 입력·저장해 주세요");
        return;
      }
      const body = savedPhone
        ? { smsPriceAlerts: true }
        : { alertPhone: digits, smsPriceAlerts: true };
      if (await patch(body)) showToast("SMS 알림을 켰어요");
    } else {
      if (await patch({ smsPriceAlerts: false })) showToast("SMS 알림을 껐어요");
    }
  }

  return (
    <div className="card flex flex-col rounded-2xl px-4 py-1">
      <div className="pb-1 pt-3 text-[11px] font-extrabold text-text-3">SMS 알림 (문자)</div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => void toggle()}
        disabled={busy}
        className="flex w-full items-center justify-between py-[11px] text-left disabled:opacity-60"
      >
        <span>
          <span className="block text-[13px] font-semibold text-text-1">
            관심단지 가격 변동 SMS 받기
          </span>
          <span className="block text-[10px] text-text-3">
            시세가 의미 있게 변하면 문자로 알려드려요
          </span>
        </span>
        <Toggle on={on} />
      </button>
      <div className="flex items-center gap-2 border-t border-[#f0f3f8] py-2.5">
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="휴대폰 번호 (예: 01012345678)"
          aria-label="SMS 알림 수신 번호"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-text-3"
        />
        <button
          type="button"
          onClick={() => void savePhone()}
          disabled={busy || !phoneValid}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50"
        >
          번호 저장
        </button>
      </div>
      <p className="pb-2.5 text-[10px] leading-[1.6] text-text-3">
        입력한 번호는 SMS 알림 발송에만 사용되며, 이 화면에서 언제든 해지할 수 있어요.
        문자 수신 시 통신사 요금 정책이 적용될 수 있습니다.
      </p>
    </div>
  );
}

/* 공통: notification-prefs 훅 (GET + 낙관적 PATCH + 롤백) */
function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "guest" | "error">("loading");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/notification-prefs", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) return setPhase("guest");
        if (!res.ok) return setPhase("error");
        const data = (await res.json()) as { prefs?: Prefs };
        if (!data.prefs) return setPhase("error");
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
        setPrefs((p) => (p ? { ...p, [key]: !next } : p));
        setSaveError("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    },
    [prefs],
  );

  return { prefs, phase, saveError, toggle };
}

function GuestCard() {
  return (
    <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
      <div className="text-[13px] font-extrabold text-ink">
        로그인하면 설정을 저장할 수 있어요
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

/* ---------------- 알림 탭 ---------------- */
function NotificationTab() {
  const { prefs, phase, saveError, toggle } = usePrefs();

  return (
    <div className="flex flex-col gap-3">
      {/* 관심 지역 알림 구독 관리 — 실제 구독은 알림센터에서 */}
      <Link
        href="/notifications"
        className="card flex items-center justify-between rounded-2xl px-4 py-3.5 no-underline"
      >
        <div>
          <div className="text-[13px] font-extrabold text-ink">관심 지역 · 급매 알림 구독</div>
          <div className="text-[10px] text-text-3">구독한 지역·키워드 추가/삭제</div>
        </div>
        <span className="text-[#c3cad6]">›</span>
      </Link>

      {phase === "loading" && (
        <div className="card rounded-2xl px-4 py-8 text-center text-[13px] text-text-3">
          알림 설정을 불러오는 중…
        </div>
      )}
      {phase === "guest" && <GuestCard />}
      {phase === "error" && (
        <div className="card rounded-2xl px-4 py-8 text-center text-[13px] text-text-3">
          설정을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.
        </div>
      )}

      {phase === "ready" && prefs && (
        <>
          {saveError && (
            <div className="rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">
              {saveError}
            </div>
          )}
          {PREF_GROUPS.map((group) => (
            <div key={group.title} className="card flex flex-col rounded-2xl px-4 py-1">
              <div className="pb-1 pt-3 text-[11px] font-extrabold text-text-3">{group.title}</div>
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
                    <span className="block text-[13px] font-semibold text-text-1">{row.label}</span>
                    {row.desc && <span className="block text-[10px] text-text-3">{row.desc}</span>}
                  </span>
                  <Toggle on={prefs[row.key]} />
                </button>
              ))}
            </div>
          ))}
          <SmsAlertCard
            initialPhone={prefs.alertPhone ?? null}
            initialOn={prefs.smsPriceAlerts ?? false}
          />
          <div className="text-[10px] text-text-3">
            변경 즉시 저장돼요 · 방해 금지 시간 등 세부 옵션은 준비 중이에요
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- 개인정보 탭 — 마케팅 수신 동의(실배선) + 처리방침 ---------------- */
function PrivacyTab() {
  const { prefs, phase, saveError, toggle } = usePrefs();

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 text-[11px] font-extrabold text-text-3">마케팅 수신 동의</div>
        {phase === "guest" ? (
          <div className="py-4">
            <GuestCard />
          </div>
        ) : phase === "loading" ? (
          <div className="py-6 text-center text-[13px] text-text-3">불러오는 중…</div>
        ) : phase === "error" || !prefs ? (
          <div className="py-6 text-center text-[13px] text-text-3">
            불러오지 못했어요. 새로고침 후 다시 시도해 주세요.
          </div>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={prefs.emailMarketing}
            onClick={() => void toggle("emailMarketing")}
            className="flex w-full items-center justify-between py-[13px] text-left"
          >
            <span>
              <span className="block text-[13px] font-semibold text-text-1">
                혜택 · 소식 이메일 받기
              </span>
              <span className="block text-[10px] text-text-3">
                새 기능 · 이벤트 · 할인 안내 (선택 · 언제든 해제)
              </span>
            </span>
            <Toggle on={prefs.emailMarketing} />
          </button>
        )}
      </div>
      {saveError && (
        <div className="rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">
          {saveError}
        </div>
      )}

      <div className="card flex flex-col gap-2 rounded-2xl p-4">
        <div className="text-[13px] font-extrabold text-ink">노트 공개 범위</div>
        <p className="text-xs leading-[1.6] text-text-2">
          공개 여부는 노트 작성·수정 화면에서 노트별로 설정할 수 있어요. 공개 노트의 동·호수는 항상
          가려져요.
        </p>
        <Link
          href="/notes"
          className="btn-soft mt-1 rounded-[10px] p-2.5 text-center text-xs no-underline"
        >
          내 노트에서 공개 설정하기
        </Link>
      </div>

      <div className="card flex flex-col gap-1.5 rounded-2xl p-4">
        <div className="text-[13px] font-extrabold text-ink">개인정보 처리</div>
        <p className="text-xs leading-[1.6] text-text-2">
          열람·정정·삭제 요청은 개인정보 처리방침의 절차를 따라요.
        </p>
        <div className="flex gap-3 text-xs">
          <Link href="/legal/privacy" className="font-bold text-primary no-underline">
            개인정보처리방침 ›
          </Link>
          <Link href="/legal/privacy-request" className="font-bold text-primary no-underline">
            열람·삭제 요청 ›
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 계정 탭 ---------------- */
function AccountTab() {
  return (
    <div className="flex flex-col gap-3">
      {/* 계정 관리 */}
      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 text-[11px] font-extrabold text-text-3">계정</div>
        <Link
          href="/forgot-password"
          className="flex items-center justify-between border-b border-[#f0f3f8] py-3 text-[13px] font-semibold text-text-1 no-underline"
        >
          <span>비밀번호 변경</span>
          <span className="text-[#c3cad6]">›</span>
        </Link>
        <div className="flex items-center justify-between border-b border-[#f0f3f8] py-3">
          <span className="text-[13px] font-semibold text-text-1">언어</span>
          <span className="text-[12px] font-bold text-text-3">한국어</span>
        </div>
        <Link
          href="/subscription"
          className="flex items-center justify-between py-3 text-[13px] font-semibold text-text-1 no-underline"
        >
          <span>구독 · 결제 관리</span>
          <span className="text-[#c3cad6]">›</span>
        </Link>
      </div>

      {/* 데이터 내보내기 — 미구현: 정직하게 준비 중 표기 */}
      <div className="card flex flex-col gap-1.5 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-extrabold text-ink">내 데이터 내보내기</span>
          <span className="text-[11px] font-bold text-text-3">준비 중</span>
        </div>
        <p className="text-[11px] leading-[1.6] text-text-2">
          임장노트 전체(PDF·ZIP)와 비교 데이터를 내려받는 기능을 준비하고 있어요. 그 전에는
          고객센터로 요청하면 도와드려요.
        </p>
      </div>

      {/* 로그아웃 · 회원탈퇴 */}
      <div className="card flex flex-col gap-2 rounded-2xl p-4">
        {/* API 라우트 전체 내비게이션 필요 — HeaderAuth와 동일 패턴 */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/auth/signout"
          className="btn-soft rounded-[10px] p-2.5 text-center text-xs font-bold no-underline"
        >
          로그아웃
        </a>
        <p className="text-center text-[11px] leading-[1.6] text-text-3">
          회원탈퇴는{" "}
          <Link href="/support" className="font-bold text-danger no-underline">
            고객센터
          </Link>
          를 통해 처리돼요 · 탈퇴 시 노트는 30일 보관 후 삭제돼요
        </p>
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
