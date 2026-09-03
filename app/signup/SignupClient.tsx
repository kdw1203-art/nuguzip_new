"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { trackPlatformEvent } from "@/lib/platform-events-client";
import { Icon } from "@/app/components/Icon";
import { stashSignupHandoff } from "@/lib/onboarding/signup-handoff";
import { useMoment } from "@/app/components/motion/MomentProvider";
import type { SocialProvider } from "@/lib/auth/configured-social";

const SOCIAL_BUTTON: Record<SocialProvider, { label: string; className: string }> = {
  /* 카카오 브랜드 가이드 — 배경 #FEE500 · 라벨 #191919 고정 */
  kakao: {
    label: "카카오로 3초 만에 시작",
    className: "bg-[#fee500] text-[#191919] shadow-[0_6px_16px_rgba(254,229,0,.3)]",
  },
  toss: {
    label: "토스로 시작",
    className: "bg-[#3182f6] text-white shadow-[0_6px_16px_rgba(49,130,246,.35)]",
  },
  google: {
    label: "Google로 시작",
    className: "border border-line bg-surface text-text-1",
  },
};

/* [개선 #9, 2026-08-22] 목표·관심지역 선택을 가입에서 **제거**했다.
   30일 실측: 진입 44명 → 목표 클릭 1명 → 완료 3명. 한 화면에 목표 3택 +
   지역 검색 + 계정 폼 + 동의 3종을 다 요구하던 것이 이탈 지점이었다.
   목표·지역은 가입 직후 온보딩(/welcome)이 **원래부터 다시 수집**하므로
   여기서 물을 이유가 없었다(중복 질문). 가입은 계정 최소한만 남긴다. */

type RegisterResponse = {
  error?: string;
  detail?: string;
  code?: string;
  message?: string;
  emailConfirmationRequired?: boolean;
  resent?: boolean;
  user?: { id: string | number; email: string; name: string };
};

export function SignupClient({ social }: { social: SocialProvider[] }) {
  const router = useRouter();
  const { showMoment } = useMoment();
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /* [개선 #9] 비밀번호 확인칸 제거 — 표시 토글로 오타를 눈으로 확인한다
     (칸 하나가 줄고, 모바일에서 두 번 입력하는 마찰이 사라진다). */
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [agreeLocation, setAgreeLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"done" | "confirm" | null>(null);
  const [confirmHint, setConfirmHint] = useState<string | null>(null);

  /* #44 가입 퍼널 계측 — /api/platform/event 로 fire-and-forget POST (실패해도 UI 무영향).
     step_1: 페이지 진입 · step_2: 목표 선택 · step_3: 기본정보/관심지역 첫 선택 ·
     step_4: 계정 폼 제출 시도 · signup_complete: 가입 성공. 스텝당 1회만 전송. */
  const firedSteps = useRef<Set<string>>(new Set());
  const trackStep = useCallback(
    (eventName: string, metadata?: Record<string, unknown>) => {
      if (firedSteps.current.has(eventName)) return;
      firedSteps.current.add(eventName);
      trackPlatformEvent({
        eventName,
        source: "signup",
        campaign: "funnel",
        metadata: { funnel: "signup", ...metadata },
      });
    },
    [],
  );

  /* [945 #11] 소프트 가입 프롬프트 수락 귀속 — SoftSignupProvider 가 남긴 키.
     "soft:watchlist_add" 형식. 가입 완료 시 register 의 source/campaign 으로
     보내져, 클릭 수가 아니라 **가입 완료 수**로 프롬프트 효과를 잰다. */
  const signupViaRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      signupViaRef.current = window.sessionStorage.getItem("nz_signup_via");
    } catch {
      signupViaRef.current = null;
    }
    trackStep(
      "signup_step_1",
      signupViaRef.current ? { via: signupViaRef.current } : undefined,
    );
  }, [trackStep]);

  /* 관심 지역·목표·인구통계는 전부 온보딩(/welcome)이 수집한다(개선 #9). */
  useEffect(() => {
    stashSignupHandoff({ regions: [], profile: {}, purpose: null });
  }, []);

  const progressDone = [
    email.trim().includes("@"),
    password.length >= 8,
    agree,
  ].filter(Boolean).length;
  const progressPct = Math.round((progressDone / 3) * 100);

  async function socialSignIn(provider: SocialProvider) {
    setError(null);
    setSocialBusy(provider);
    stashSignupHandoff({ regions: [], profile: {}, purpose: null });
    trackStep("signup_step_4", { method: provider });
    // 토스는 자체 리다이렉트 시작점 — 인가 후 /auth/toss/callback 이 세션을 만든다.
    if (provider === "toss") {
      window.location.href = "/api/auth/toss/start?callbackUrl=%2Fwelcome";
      return;
    }
    try {
      await signIn(provider, { callbackUrl: "/welcome" });
    } catch {
      setError("소셜 가입에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setSocialBusy(null);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    trackStep("signup_step_4");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setError("올바른 이메일을 입력해 주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (!agree) {
      setError("이용약관·개인정보처리방침·만 14세 이상에 동의해 주세요.");
      return;
    }
    setBusy(true);
    try {
      // 구 회원가입 API 스펙(/api/auth/register)에 맞춘 전송 필드
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          name: name.trim(),
          source: signupViaRef.current ? "soft_signup" : "onboarding_signup",
          campaign: signupViaRef.current?.replace(/^soft:/, "") || "default",
          consent: {
            terms: true,
            privacy: true,
            age: true,
            marketing: agreeMarketing,
            location: agreeLocation,
          },
        }),
      });
      const raw = await res.text();
      let data: RegisterResponse;
      try {
        data = (raw ? JSON.parse(raw) : {}) as RegisterResponse;
      } catch {
        data = {};
      }
      if (!res.ok) {
        if (res.status === 409 || data.code === "already_registered") {
          setError(
            "이미 가입된 이메일입니다. 로그인하거나, 인증 전이라면 같은 정보로 다시 가입하면 인증 메일을 다시 받을 수 있어요.",
          );
          return;
        }
        const detail = data.detail ? ` (${data.detail})` : "";
        setError(`${data.error ?? "가입에 실패했습니다."}${detail}`);
        return;
      }
      trackStep("signup_complete", {
        emailConfirmationRequired: Boolean(data.emailConfirmationRequired),
        ...(signupViaRef.current ? { via: signupViaRef.current } : {}),
      });
      /* 귀속 소진 — 같은 탭의 다음 가입 시도에 새 프롬프트 없이 딸려가지 않게 */
      try {
        window.sessionStorage.removeItem("nz_signup_via");
      } catch {
        /* ignore */
      }
      if (data.emailConfirmationRequired) {
        setConfirmHint(
          data.message ??
            (data.resent
              ? "인증 메일을 다시 보냈습니다. 메일함의 새 링크를 확인해 주세요."
              : null),
        );
        setDone("confirm");
        return;
      }
      // 가입 직후 자동 로그인 → /welcome 온보딩으로 이동 (실패해도 /welcome 이 로그인으로 안내)
      try {
        await signIn("password", {
          email: normalizedEmail,
          password,
          redirect: false,
          callbackUrl: "/welcome",
        });
      } catch {
        /* 로그인 실패는 /welcome 쪽 가드가 처리 */
      }
      showMoment({
        title: "가입이 끝났어요",
        subtitle: "관심 지역에 맞춰 첫 화면을 준비할게요",
        kind: "celebrate",
      });
      router.replace("/welcome");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main
        className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col justify-center gap-4 px-7 pb-8"
        style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
      >
        <div className="rise-in card flex flex-col items-center gap-3 rounded-[18px] p-7 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-xl">
            {done === "confirm" ? <Icon name="✉" size={24} /> : "✓"}
          </span>
          <h1 className="text-[20px] font-extrabold text-ink">
            {done === "confirm" ? "인증 메일을 보냈어요" : "가입이 완료됐어요"}
          </h1>
          <p className="text-[13px] leading-[1.6] text-text-2">
            {done === "confirm" ? (
              <>
                <b className="text-ink">{email.trim().toLowerCase()}</b>로 인증 메일을 보냈습니다.
                <br />
                메일의 링크를 확인한 뒤 로그인해 주세요.
                {confirmHint ? (
                  <>
                    <br />
                    <span className="mt-1 block font-bold text-primary">{confirmHint}</span>
                  </>
                ) : null}
              </>
            ) : (
              <>이제 방금 만든 계정으로 로그인하면 맞춤 지표와 체크리스트가 준비됩니다.</>
            )}
          </p>
          {done === "confirm" ? (
            <button
              type="button"
              disabled={resendBusy}
              onClick={async () => {
                setResendBusy(true);
                setConfirmHint(null);
                try {
                  const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      email: email.trim().toLowerCase(),
                      password,
                      name: name.trim(),
                      resendConfirmation: true,
                    }),
                  });
                  const data = (await res.json().catch(() => ({}))) as RegisterResponse;
                  if (!res.ok) {
                    setConfirmHint(data.error ?? "재발송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
                    return;
                  }
                  setConfirmHint(
                    data.message ?? "인증 메일을 다시 보냈습니다. 메일함의 새 링크를 확인해 주세요.",
                  );
                } catch {
                  setConfirmHint("네트워크 오류가 발생했습니다.");
                } finally {
                  setResendBusy(false);
                }
              }}
              className="w-full rounded-2xl border border-line bg-surface p-[15px] text-center text-base font-extrabold text-ink disabled:opacity-60"
            >
              {resendBusy ? "보내는 중…" : "인증 메일 다시 보내기"}
            </button>
          ) : null}
          <Link
            href="/login?callbackUrl=/welcome"
            className="btn-primary btn-cta mt-1 w-full rounded-2xl p-[15px] text-center text-base"
          >
            로그인하러 가기
          </Link>
          <button
            type="button"
            className="text-xs font-bold text-primary"
            onClick={() => {
              setDone(null);
              setConfirmHint(null);
              setError(null);
            }}
          >
            다른 이메일로 다시 가입
          </button>
          <Link href="/" className="text-xs text-text-3">
            나중에 할게요 · 홈으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col gap-4 px-7 pb-8"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
    >
      <div className="flex items-center justify-between">
        <Link href="/login" className="text-base text-text-1" aria-label="뒤로">
          ‹
        </Link>
        {/* 진행 막대 — 예전엔 w-1/2 하드코딩이라 페이지를 열자마자 50%,
            제출 직전에도 50% 였다. 실제로 채운 항목 비율로 그린다. */}
        <div
          className="relative h-1 w-[120px] rounded-sm bg-bg"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          aria-label="가입 진행률"
        >
          <div
            className="absolute left-0 top-0 h-1 rounded-sm bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <Link href="/" className="text-[13px] text-text-3">
          건너뛰기
        </Link>
      </div>

      <h1 className="rise-in text-[22px] font-extrabold leading-[1.35] text-ink">
        30초면 시작할 수 있어요
      </h1>
      <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
        가입 후 관심 지역·목표를 골라 맞춤 화면을 만들어 드려요
      </p>

      {social.length > 0 && (
        <div className="rise-in-2 flex flex-col gap-2.5">
          {social.map((provider) => (
            <button
              key={provider}
              type="button"
              onClick={() => socialSignIn(provider)}
              disabled={busy || socialBusy !== null}
              className={`rounded-[14px] p-3.5 text-center text-[15px] font-bold disabled:opacity-60 ${SOCIAL_BUTTON[provider].className}`}
            >
              {socialBusy === provider ? "연결 중…" : SOCIAL_BUTTON[provider].label}
            </button>
          ))}
          <div className="flex items-center gap-3 text-[11px] text-text-3">
            <span className="h-px flex-1 bg-bg" />
            또는 이메일로 가입
            <span className="h-px flex-1 bg-bg" />
          </div>
        </div>
      )}

      {/* [개선 #9] 목표 3택·관심지역 검색 블록 제거 — /welcome 온보딩이 수집한다.
          실측에서 이 두 블록 앞에서 거의 전원이 이탈했다(30일 44→1). */}
      <form onSubmit={onSubmit} className="rise-in-5 flex flex-col gap-2">
        <div className="text-[13px] font-extrabold text-ink">
          계정 만들기{" "}
          <span className="text-[11px] font-medium text-text-3">이메일로 가입</span>
        </div>
        {/* 항목 47 — sr-only 라벨 + id (placeholder 는 접근 가능한 이름이 아니다) */}
        <label htmlFor="signup-name" className="sr-only">
          이름 (선택)
        </label>
        <input
          id="signup-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름 (선택)"
          autoComplete="name"
          className="rounded-[10px] border border-line bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
        />
        <label htmlFor="signup-email" className="sr-only">
          이메일
        </label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          autoComplete="email"
          className="rounded-[10px] border border-line bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
        />
        <label htmlFor="signup-password" className="sr-only">
          비밀번호 (8자 이상)
        </label>
        <div className="relative">
          <input
            id="signup-password"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (8자 이상)"
            autoComplete="new-password"
            className="w-full rounded-[10px] border border-line bg-surface px-4 py-3 pr-14 text-sm text-ink outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-pressed={showPw}
            aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-bold text-text-3"
          >
            {showPw ? "숨김" : "표시"}
          </button>
        </div>
        <label className="flex items-center gap-2 py-1 text-xs text-text-2">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="h-4 w-4 accent-[#1d4fd8]"
          />
          <span>
            <b className="text-ink">(필수)</b> 이용약관·개인정보처리방침에 동의하며 만 14세
            이상입니다
          </span>
        </label>
        <label className="flex items-center gap-2 py-1 text-xs text-text-2">
          <input
            type="checkbox"
            checked={agreeMarketing}
            onChange={(e) => setAgreeMarketing(e.target.checked)}
            className="h-4 w-4 accent-[#1d4fd8]"
          />
          <span>
            (선택) 혜택·소식 이메일 수신 — 언제든 설정에서 철회할 수 있어요
          </span>
        </label>
        <label className="flex items-center gap-2 py-1 text-xs text-text-2">
          <input
            type="checkbox"
            checked={agreeLocation}
            onChange={(e) => setAgreeLocation(e.target.checked)}
            className="h-4 w-4 accent-[#1d4fd8]"
          />
          <span>
            (선택) 위치정보 이용(주변 단지·지도 편의) — 설정에서 언제든 철회
          </span>
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-[10px] bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-primary btn-cta rounded-2xl p-[15px] text-center text-base disabled:opacity-60"
        >
          {busy ? "가입 중…" : "시작하기"}
        </button>
        <div className="text-center text-xs text-text-3">
          이미 계정이 있나요?{" "}
          <Link href="/login" className="font-bold text-primary">
            로그인
          </Link>
        </div>
      </form>
    </main>
  );
}
