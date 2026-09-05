"use client";

import { Switch } from "@/app/components/ui/Switch";
import { Segmented } from "@/app/components/ui/Segmented";
import { useTheme } from "next-themes";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { PageShell } from "@/app/components/PageShell";
import { useToast } from "@/app/components/toast/ToastProvider";
import { PushSubscribe } from "@/components/PushSubscribe";
import { DELETE_CONFIRM_WORD, DELETE_GRACE_DAYS } from "@/lib/account/deletion";
import { useUnsavedGuard } from "@/lib/client/use-unsaved-guard";

/* 설정 (item 14) — 진짜 설정만 유지, 네비게이션성 항목 제거.
   섹션: 계정 · 알림 · 개인정보. 저장되는 토글만 실배선(/api/me/notification-prefs),
   저장 API 없는 항목은 지어내지 않고 링크·정직한 안내로 대체. */

/**
 * 이 서버가 실제로 **보낼 수 있는 채널**. 서버 컴포넌트(page.tsx)가 env 를 보고 넘긴다.
 *
 * 2026-07-28: 이 화면에는 푸시 알림 토글이 8개 있었는데 운영에는 VAPID 키가 없었다.
 * 토글은 저장까지 정상으로 되고(=초록불이 켜지고) 알림만 영영 오지 않는다. 로그인
 * 화면의 소셜 버튼과 같은 부류인데, 그쪽은 눌러 보면 에러라도 나서 알 수 있었던 반면
 * 이건 **틀렸다는 걸 알 방법이 사용자에게 없다**. 그래서 더 나쁘다.
 *
 * 원칙: 지금 보낼 수 없는 채널은 설정 줄을 그리지 않는다. 키가 들어오면 다시 나타난다.
 */
export type NotifyChannels = {
  /** Resend 설정됨 — 알림 메일이 실제로 나감 */
  email: boolean;
  /** VAPID 공개키+개인키 둘 다 있음 — 웹 푸시가 실제로 나감 */
  push: boolean;
  /** NCP SENS 설정됨 — 가격 알림 문자가 실제로 나감 */
  sms: boolean;
};

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
  | "pushExpert"
  | "pushReengagement"
  | "pushListingStale"
  | "pushAttendance"
  | "pushWeeklyDigest"
  | "emailWatchlistTx";

type Prefs = Record<PrefKey, boolean> & {
  /** SMS(NCP SENS) 관심단지 가격 알림 — 별도 카드에서 관리 */
  alertPhone?: string | null;
  smsPriceAlerts?: boolean;
};

const PREF_GROUPS: {
  title: string;
  /** 이 묶음이 실제로 나가는 통로 — 꺼져 있으면 묶음째 그리지 않는다 */
  channel: keyof NotifyChannels;
  rows: { key: PrefKey; label: string; desc?: string }[];
}[] = [
  {
    title: "이메일 알림",
    channel: "email",
    rows: [
      { key: "emailComments", label: "댓글 · 답글", desc: "내 글·노트에 반응이 달리면" },
      { key: "emailLikes", label: "좋아요 · 저장" },
      { key: "emailMeeting", label: "임장 모임 · 모임 채팅", desc: "새 메시지 · 일정 변경" },
      { key: "emailExpert", label: "전문가 상담 답변" },
      {
        key: "emailWatchlistTx",
        label: "관심단지 새 실거래",
        desc: "담아둔 단지에 새 실거래가 신고되면 하루 1통으로 묶어서 (기본 켜짐)",
      },
    ],
  },
  {
    title: "푸시 알림",
    channel: "push",
    rows: [
      { key: "pushComments", label: "댓글 · 답글" },
      { key: "pushLikes", label: "좋아요 · 저장" },
      { key: "pushMeeting", label: "임장 모임 · 모임 채팅" },
      { key: "pushExpert", label: "전문가 상담 답변" },
      {
        key: "pushReengagement",
        label: "쓰다 만 기록 알림",
        desc: "작성 중이던 임장노트가 남아 있을 때 한 번만",
      },
      {
        key: "pushListingStale",
        label: "내 매물 신선도 알림",
        desc: "등록한 매물이 21일 넘게 그대로면 끌어올리기 안내, 60일이면 마감 제안",
      },
      {
        key: "pushAttendance",
        label: "출석 리마인드",
        desc: "오늘 출석을 아직 안 했으면 저녁에 1회 (기본 켜짐)",
      },
      {
        key: "pushWeeklyDigest",
        label: "주간 다이제스트",
        desc: "매주 월요일 저녁, 최근 7일 뉴스·시세 요약 1회 (기본 꺼짐)",
      },
    ],
  },
];

/* [961] 토글 시각부는 공용 Switch(네이비 트랙 + 주홍 온점 손잡이)로 통일 */
const Toggle = Switch;

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
  /* [966] 이 화면에서 "저장" 버튼이 따로 있는 입력은 이 번호 하나다(토글은 전부 즉시
     저장). 적어 두고 저장 안 누른 채 새로고침하면 한 번 묻는다. */
  useUnsavedGuard(digits !== "" && digits !== (savedPhone ?? "").replace(/\D/g, ""));

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
      <div className="pb-1 pt-3 t-sub font-extrabold text-text-3">SMS 알림 (문자)</div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => void toggle()}
        disabled={busy}
        className="flex w-full items-center justify-between py-[11px] text-left disabled:opacity-60"
      >
        <span>
          <span className="block t-body font-semibold text-text-1">
            관심단지 가격 변동 SMS 받기
          </span>
          <span className="block t-caption text-text-3">
            시세가 의미 있게 변하면 문자로 알려드려요
          </span>
        </span>
        <Toggle on={on} />
      </button>
      <div className="flex items-center gap-2 border-t border-divider py-2.5">
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="휴대폰 번호 (예: 01012345678)"
          aria-label="SMS 알림 수신 번호"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 t-body text-ink outline-none placeholder:text-text-3"
        />
        <button
          type="button"
          onClick={() => void savePhone()}
          disabled={busy || !phoneValid}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 t-sub font-bold text-white disabled:opacity-50"
        >
          번호 저장
        </button>
      </div>
      <p className="pb-2.5 t-caption text-text-3">
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
      <div className="t-body font-extrabold text-ink">
        로그인하면 설정을 저장할 수 있어요
      </div>
      <Link
        href={`/login?callbackUrl=${encodeURIComponent("/my/settings")}`}
        className="btn-primary rounded-xl px-5 py-2.5 t-body no-underline"
      >
        로그인
      </Link>
    </div>
  );
}

/* ---------------- 알림 탭 ---------------- */
function NotificationTab({ channels }: { channels: NotifyChannels }) {
  const { prefs, phase, saveError, toggle } = usePrefs();
  const groups = PREF_GROUPS.filter((g) => channels[g.channel]);

  return (
    <div className="flex flex-col gap-3">
      {/* 관심 지역 알림 구독 관리 — 실제 구독은 알림센터에서 */}
      <Link
        href="/notifications"
        className="card flex items-center justify-between rounded-2xl px-4 py-3.5 no-underline"
      >
        <div>
          <div className="t-body font-extrabold text-ink">관심 지역 · 급매 알림 구독</div>
          <div className="t-caption text-text-3">구독한 지역·키워드 추가/삭제</div>
        </div>
        <span className="text-on-dark-muted">›</span>
      </Link>

      {phase === "loading" && (
        <div className="card rounded-2xl px-4 py-8 text-center t-body text-text-3">
          알림 설정을 불러오는 중…
        </div>
      )}
      {phase === "guest" && <GuestCard />}
      {phase === "error" && (
        <div className="card rounded-2xl px-4 py-8 text-center t-body text-text-3">
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
          {groups.map((group) => (
            <div key={group.title} className="card flex flex-col rounded-2xl px-4 py-1">
              <div className="flex items-center justify-between pb-1 pt-3">
                <span className="t-sub font-extrabold text-text-3">{group.title}</span>
                {/* 푸시는 서버 키만으로는 못 간다 — 이 브라우저의 구독 허용까지 있어야
                    비로소 도착한다. 그래서 켜는 입구를 토글 바로 옆에 둔다.
                    (예전엔 모바일 메뉴에만 있어서 PC 사용자는 켤 방법이 없었다.) */}
                {group.channel === "push" && <PushSubscribe />}
              </div>
              {group.rows.map((row, i) => (
                <button
                  key={row.key}
                  type="button"
                  role="switch"
                  aria-checked={prefs[row.key]}
                  onClick={() => void toggle(row.key)}
                  className={`flex w-full items-center justify-between py-[11px] text-left ${
                    i < group.rows.length - 1 ? "border-b border-divider" : ""
                  }`}
                >
                  <span>
                    <span className="block t-body font-semibold text-text-1">{row.label}</span>
                    {row.desc && <span className="block t-caption text-text-3">{row.desc}</span>}
                  </span>
                  <Toggle on={prefs[row.key]} />
                </button>
              ))}
            </div>
          ))}
          {channels.sms && (
            <SmsAlertCard
              initialPhone={prefs.alertPhone ?? null}
              initialOn={prefs.smsPriceAlerts ?? false}
            />
          )}
          {groups.length === 0 && !channels.sms ? (
            /* 채널이 하나도 없을 때 빈 화면만 두면 "설정이 사라졌다" 로 읽힌다.
               지금 상태를 그대로 말한다 — 알림함은 채널과 무관하게 항상 동작한다. */
            <div className="card rounded-2xl px-4 py-6 text-center t-sub text-text-2">
              지금은 메일·푸시·문자 알림을 보내지 않고 있어요.
              <br />
              새 소식은 위의 <span className="font-bold text-text-1">알림함</span>에서 확인하실 수
              있어요.
            </div>
          ) : (
            <div className="t-caption text-text-3">
              변경 즉시 저장돼요
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- 개인정보 탭 — 마케팅 수신 동의(실배선) + 처리방침 ----------------
   여기 마케팅 토글은 **발송 스위치가 아니라 동의 기록**이다. 그래서 위 알림 탭과 달리
   메일 발송이 꺼져 있어도 감추지 않는다 — 동의·철회는 언제든 할 수 있어야 한다. */
function usePrivacyConsents() {
  const [phase, setPhase] = useState<"guest" | "loading" | "ready" | "error">("loading");
  const [marketing, setMarketing] = useState(false);
  const [location, setLocation] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/consents", { cache: "no-store" });
        if (res.status === 401) {
          if (!cancelled) setPhase("guest");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setPhase("error");
          return;
        }
        const data = (await res.json()) as {
          consents?: { marketing?: boolean; location?: boolean };
        };
        if (!cancelled) {
          setMarketing(Boolean(data.consents?.marketing));
          setLocation(Boolean(data.consents?.location));
          setPhase("ready");
        }
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function patch(partial: { marketing?: boolean; location?: boolean }) {
    setSaveError(null);
    const res = await fetch("/api/me/consents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setSaveError(data.error ?? "저장에 실패했습니다.");
      return;
    }
    const data = (await res.json()) as {
      consents?: { marketing?: boolean; location?: boolean };
    };
    if (typeof data.consents?.marketing === "boolean") setMarketing(data.consents.marketing);
    if (typeof data.consents?.location === "boolean") setLocation(data.consents.location);
  }

  return { phase, marketing, location, saveError, patch };
}

function PrivacyTab() {
  const { prefs, phase, saveError, toggle } = usePrefs();
  const consents = usePrivacyConsents();

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 t-sub font-extrabold text-text-3">선택 동의 · 철회</div>
        {phase === "guest" || consents.phase === "guest" ? (
          <div className="py-4">
            <GuestCard />
          </div>
        ) : phase === "loading" || consents.phase === "loading" ? (
          <div className="py-6 text-center t-body text-text-3">불러오는 중…</div>
        ) : phase === "error" || !prefs || consents.phase === "error" ? (
          <div className="py-6 text-center t-body text-text-3">
            불러오지 못했어요. 새로고침 후 다시 시도해 주세요.
          </div>
        ) : (
          <>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.emailMarketing || consents.marketing}
              onClick={() => {
                const next = !(prefs.emailMarketing || consents.marketing);
                void toggle("emailMarketing");
                void consents.patch({ marketing: next });
              }}
              className="flex w-full items-center justify-between border-b border-divider py-[13px] text-left"
            >
              <span>
                <span className="block t-body font-semibold text-text-1">
                  혜택 · 소식 이메일 받기
                </span>
                <span className="block t-caption text-text-3">
                  새 기능 · 이벤트 · 할인 안내 (선택 · 언제든 해제)
                </span>
              </span>
              <Toggle on={prefs.emailMarketing || consents.marketing} />
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={consents.location}
              onClick={() => void consents.patch({ location: !consents.location })}
              className="flex w-full items-center justify-between py-[13px] text-left"
            >
              <span>
                <span className="block t-body font-semibold text-text-1">
                  위치정보 이용 동의
                </span>
                <span className="block t-caption text-text-3">
                  주변 단지·지도 편의 (선택 · 언제든 철회)
                </span>
              </span>
              <Toggle on={consents.location} />
            </button>
          </>
        )}
      </div>
      {(saveError || consents.saveError) && (
        <div className="rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">
          {saveError || consents.saveError}
        </div>
      )}

      <div className="card flex flex-col gap-2 rounded-2xl p-4">
        <div className="t-body font-extrabold text-ink">노트 공개 범위</div>
        <p className="text-xs leading-[1.6] text-text-2">
          공개 여부는 노트 작성·수정 화면에서 노트별로 설정할 수 있어요. 사진은 업로드할 때 위치정보(EXIF)를
          지우지만, 본문 글자나 사진 속 인물·차량번호를 자동으로 가려 주지는 않아요. 공개로 올리기 전에
          직접 확인해 주세요.
        </p>
        <Link
          href="/notes"
          className="btn-soft mt-1 rounded-[10px] p-2.5 text-center text-xs no-underline"
        >
          내 노트에서 공개 설정하기
        </Link>
      </div>

      <div className="card flex flex-col gap-1.5 rounded-2xl p-4">
        <div className="t-body font-extrabold text-ink">개인정보 처리</div>
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

/* [966] 화면 테마 — 시스템 / 라이트 / 다크. 전체 메뉴의 토글은 라이트↔다크만
   오가므로 "시스템을 따르기" 는 여기서만 고를 수 있다. next-themes 의 theme 는
   서버에서 알 수 없어(localStorage) 마운트 뒤에만 컨트롤을 그린다 — 하이드레이션
   불일치 방지. 그 전엔 같은 높이의 빈 자리만 둔다. */
type ThemeChoice = "system" | "light" | "dark";
const THEME_OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: "system", label: "시스템" },
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
];

function ThemeRow() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current: ThemeChoice =
    theme === "dark" || theme === "light" || theme === "system" ? theme : "light";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-divider py-3">
      <span className="t-body font-semibold text-text-1">화면 테마</span>
      {mounted ? (
        <Segmented<ThemeChoice>
          options={THEME_OPTIONS}
          value={current}
          onChange={(v) => setTheme(v)}
          ariaLabel="화면 테마"
        />
      ) : (
        <span className="h-8" aria-hidden="true" />
      )}
    </div>
  );
}

/* ---------------- 계정 탭 ---------------- */
function AccountTab() {
  return (
    <div className="flex flex-col gap-3">
      {/* 계정 관리 */}
      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 t-sub font-extrabold text-text-3">계정</div>
        <Link
          href="/forgot-password"
          className="flex items-center justify-between border-b border-divider py-3 t-body font-semibold text-text-1 no-underline"
        >
          <span>비밀번호 변경</span>
          <span className="text-on-dark-muted">›</span>
        </Link>
        <div className="flex items-center justify-between border-b border-divider py-3">
          <span className="t-body font-semibold text-text-1">언어</span>
          <span className="t-sub font-bold text-text-3">한국어</span>
        </div>
        {/* [966] 화면 테마 */}
        <ThemeRow />
        <Link
          href="/subscription"
          className="flex items-center justify-between py-3 t-body font-semibold text-text-1 no-underline"
        >
          <span>구독 · 결제 관리</span>
          <span className="text-on-dark-muted">›</span>
        </Link>
      </div>

      {/* 데이터 내보내기 — 미구현: 정직하게 준비 중 표기 */}
      <div className="card flex flex-col gap-1.5 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <span className="t-body font-extrabold text-ink">내 데이터 내보내기</span>
          <span className="t-sub font-bold text-text-3">준비 중</span>
        </div>
        <p className="t-sub text-text-2">
          임장노트 전체(PDF·ZIP)와 비교 데이터를 내려받는 기능을 준비하고 있어요. 그 전에는
          고객센터로 요청하면 도와드려요.
        </p>
      </div>

      {/* 로그아웃 · 회원탈퇴 */}
      <div className="card flex flex-col gap-2 rounded-2xl p-4">
        <Link
          href="/logout"
          prefetch={false}
          className="btn-soft rounded-[10px] p-2.5 text-center text-xs font-bold no-underline"
        >
          로그아웃
        </Link>
        <DeleteAccountSection />
      </div>
    </div>
  );
}

/* [965] 회원탈퇴 — 약관·FAQ 가 약속한 "서비스 내 기능". 절차는 SOP(docs/ops/
   privacy-requests.md) 그대로: 접수 즉시 로그인 차단·공개 글 비공개 → 30일 유예 →
   파기. 실수를 막기 위해 '탈퇴' 를 직접 입력해야 한다. */
function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (confirm.trim() !== DELETE_CONFIRM_WORD) {
      setError(`'${DELETE_CONFIRM_WORD}' 를 정확히 입력해 주세요.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/me/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirm.trim(), reason: reason.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        purgeAfter?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "탈퇴 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const when = data.purgeAfter
        ? new Date(data.purgeAfter).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : `${DELETE_GRACE_DAYS}일 뒤`;
      setDone(when);
      window.setTimeout(() => {
        void signOut({ callbackUrl: "/?bye=1" });
      }, 2500);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-[10px] bg-primary-soft px-4 py-3 t-sub text-primary">
        탈퇴 요청을 접수했어요. 개인정보는 <b>{done}</b> 이후 파기되며, 그 전에 취소하려면 가입
        이메일로 고객센터에 알려 주세요. 잠시 후 로그아웃됩니다.
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="t-sub font-bold text-danger underline-offset-2 hover:underline"
        >
          회원탈퇴
        </button>
        <p className="text-center t-sub text-text-3">
          탈퇴 시 공개 글은 즉시 비공개되고, 개인정보는 {DELETE_GRACE_DAYS}일 뒤 파기돼요
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-danger/30 bg-danger-soft/40 p-3">
      <div className="t-body font-extrabold text-ink">정말 탈퇴하시겠어요?</div>
      <ul className="flex list-disc flex-col gap-1 pl-4 t-sub text-text-2">
        <li>접수 즉시 로그인이 막히고, 공개한 임장노트·매물은 비공개로 바뀝니다.</li>
        <li>
          개인정보는 {DELETE_GRACE_DAYS}일 뒤 파기됩니다. 그 사이 가입 이메일로 고객센터에
          알리면 취소할 수 있어요.
        </li>
        <li>사용 중인 이용권의 남은 기간은 소멸합니다. 자동결제 구독은 먼저 해지해 주세요.</li>
        <li>결제·환불 기록 등 법령상 보존 대상은 가명 처리해 정해진 기간 보관됩니다.</li>
      </ul>
      <label className="flex flex-col gap-1 t-sub text-text-2">
        떠나는 이유를 알려 주시면 개선에 참고할게요 (선택)
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          className="rounded-[8px] border border-line bg-surface px-3 py-2 t-body text-ink outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1 t-sub text-text-2">
        확인을 위해 <b className="text-ink">{DELETE_CONFIRM_WORD}</b> 를 입력해 주세요
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          className="rounded-[8px] border border-line bg-surface px-3 py-2 t-body text-ink outline-none focus:border-danger"
        />
      </label>
      {error && (
        <p role="alert" className="t-sub font-bold text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setConfirm("");
          }}
          disabled={busy}
          className="btn-soft flex-1 rounded-[10px] p-2.5 text-center text-xs font-bold"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || confirm.trim() !== DELETE_CONFIRM_WORD}
          className="flex-1 rounded-[10px] bg-danger p-2.5 text-center text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? "접수 중…" : "탈퇴 요청"}
        </button>
      </div>
    </div>
  );
}

export function SettingsClient({ channels }: { channels: NotifyChannels }) {
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
                tab === t.key ? "chip-active" : "border border-line bg-surface text-text-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="rise-in-1">
          {tab === "account" && <AccountTab />}
          {tab === "notification" && <NotificationTab channels={channels} />}
          {tab === "privacy" && <PrivacyTab />}
        </div>
      </div>
    </PageShell>
  );
}
