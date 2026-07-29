"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { trackPlatformEvent } from "@/lib/platform-events-client";
import { Icon } from "@/app/components/Icon";
import { RegionPicker } from "@/app/components/RegionPicker";
import { stashSignupHandoff } from "@/lib/onboarding/signup-handoff";
import { useMoment } from "@/app/components/motion/MomentProvider";
import type { SocialProvider } from "@/lib/auth/configured-social";

const SOCIAL_BUTTON: Record<SocialProvider, { label: string; className: string }> = {
  kakao: {
    label: "카카오로 3초 만에 시작",
    className: "bg-[#fee500] text-[#191919]",
  },
  naver: { label: "네이버로 시작", className: "bg-[#03c75a] text-white" },
  google: {
    label: "Google로 시작",
    className: "border border-[#e2e7ee] bg-surface text-text-1",
  },
};

/* 목표 카드. purpose 는 온보딩(/welcome)의 "목적" 과 같은 값이라 프리필에 쓴다.
   전문가·중개사는 대응되는 목적이 없어 null — 없는 값을 지어내지 않는다. */
const GOALS = [
  { icon: "🏠", title: "첫 내집마련", desc: "실거주 관점 체크리스트 중심", purpose: "live" },
  { icon: "📈", title: "투자 · 갈아타기", desc: "수익률·시세 흐름 중심", purpose: "invest" },
  { icon: "💼", title: "전문가 · 중개사", desc: "리포트 발행·상담 도구", purpose: null },
] as const;

const SEGMENTS: { name: string; options: string[]; initial: string }[] = [
  { name: "나이대", options: ["20대", "30대", "40대", "50대+"], initial: "30대" },
  { name: "성별", options: ["남", "여"], initial: "남" },
  { name: "가구", options: ["1인 거주", "2인 거주", "3인 이상"], initial: "2인 거주" },
  { name: "직업", options: ["직장인", "사업자", "법인"], initial: "직장인" },
  { name: "생애최초", options: ["해당", "비해당"], initial: "해당" },
  { name: "보유 주택", options: ["무주택", "1주택", "2주택+"], initial: "무주택" },
];

/** 관심 지역 선택 상한 — /welcome 온보딩과 같은 값(라벨의 "최대 3곳") */
const MAX_REGIONS = 3;

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
  const [goal, setGoal] = useState(0);
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);
  const [segments, setSegments] = useState<Record<string, string>>(
    Object.fromEntries(SEGMENTS.map((s) => [s.name, s.initial]))
  );
  const [regions, setRegions] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [agree, setAgree] = useState(false);
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

  useEffect(() => {
    trackStep("signup_step_1");
  }, [trackStep]);

  /* 이 화면이 물어본 것 중 가입 API 스펙에 없는 값들(관심 지역·기본 정보·목표)을
     온보딩으로 넘긴다. 가입 API 는 email·password·name·consent 만 받는다.
     예전에는 넘기지도 저장하지도 않아서, 세 가지 질문의 답이 제출 순간 통째로
     사라지고 바로 다음 화면이 같은 질문을 다시 했다. */
  useEffect(() => {
    stashSignupHandoff({ regions, profile: segments, purpose: GOALS[goal].purpose });
  }, [regions, segments, goal]);

  /* 진행률 — 사용자가 실제로 채워야 하는 것만 센다. 목표·기본 정보는 기본값이
     이미 들어 있어(GOALS[0], SEGMENTS.initial) 세면 열자마자 진행된 것처럼 보인다. */
  const progressDone = [
    regions.length > 0,
    email.trim().includes("@"),
    password.length >= 8 && password === password2,
    agree,
  ].filter(Boolean).length;
  const progressPct = Math.round((progressDone / 4) * 100);

  async function socialSignIn(provider: SocialProvider) {
    setError(null);
    setSocialBusy(provider);
    stashSignupHandoff({
      regions,
      profile: segments,
      purpose: GOALS[goal].purpose,
    });
    trackStep("signup_step_4", { method: provider });
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
    if (password !== password2) {
      setError("비밀번호 확인이 일치하지 않습니다.");
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
          source: "onboarding_signup",
          campaign: "default",
          consent: {
            terms: true,
            privacy: true,
            age: true,
            marketing: false,
            location: false,
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
        goal: GOALS[goal].title,
        emailConfirmationRequired: Boolean(data.emailConfirmationRequired),
      });
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
        <div className="rise-in card flex flex-col items-center gap-3 rounded-[20px] p-7 text-center">
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
              className="w-full rounded-2xl border border-[#d7dee8] bg-white p-[15px] text-center text-base font-extrabold text-ink disabled:opacity-60"
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
          className="relative h-1 w-[120px] rounded-sm bg-[#e9edf3]"
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
        어떤 집을 찾고 계세요?
      </h1>
      <p className="rise-in-1 -mt-2 text-[13px] text-text-2">맞춤 지표와 체크리스트를 준비해 드려요</p>

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
            <span className="h-px flex-1 bg-[#e9edf3]" />
            또는 이메일로 가입
            <span className="h-px flex-1 bg-[#e9edf3]" />
          </div>
        </div>
      )}

      <div className="rise-in-2 flex flex-col gap-2.5">
        {GOALS.map((g, i) => (
          <button
            key={g.title}
            type="button"
            onClick={() => {
              trackStep("signup_step_2", { goal: g.title });
              setGoal(i);
            }}
            className={`flex items-center gap-3 rounded-2xl p-4 text-left ${
              goal === i
                ? "border-[1.5px] border-primary bg-[rgba(29,79,216,.08)]"
                : "card"
            }`}
          >
            <Icon name={g.icon} size={20} />
            <span className="flex-1">
              <span className={`block text-sm font-extrabold ${goal === i ? "text-primary" : "text-ink"}`}>
                {g.title}
              </span>
              <span className={`block text-xs ${goal === i ? "text-[#5b74b8]" : "text-text-3"}`}>
                {g.desc}
              </span>
            </span>
            {goal === i && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="rise-in-3 flex flex-col gap-2">
        <div className="text-[13px] font-extrabold text-ink">
          기본 정보{" "}
          <span className="text-[11px] font-medium text-text-3">맞춤 추천에 사용 · 나중에 수정 가능</span>
        </div>
        {SEGMENTS.map((seg) => (
          <div key={seg.name} className="flex items-center gap-2">
            <span className="w-[60px] shrink-0 text-xs text-text-2">{seg.name}</span>
            <div className="flex flex-wrap gap-[5px]">
              {seg.options.map((opt) => {
                const active = segments[seg.name] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      trackStep("signup_step_3", { section: "segment" });
                      setSegments((prev) => ({ ...prev, [seg.name]: opt }));
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs ${
                      active
                        ? "border-[1.5px] border-primary bg-primary-soft font-bold text-primary"
                        : "border border-[#e2e7ee] bg-surface text-text-2"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="rise-in-4 flex flex-col gap-2">
        <label htmlFor="signup-region-search" className="text-[13px] font-extrabold text-ink">
          관심 지역{" "}
          <span className="text-[11px] font-medium text-text-3">
            전국 시·군·구 검색 · 최대 {MAX_REGIONS}곳
          </span>
        </label>
        <RegionPicker
          inputId="signup-region-search"
          value={regions}
          onChange={setRegions}
          max={MAX_REGIONS}
          onFirstPick={() => trackStep("signup_step_3", { section: "region" })}
        />
      </div>

      <form onSubmit={onSubmit} className="rise-in-5 flex flex-col gap-2">
        <div className="text-[13px] font-extrabold text-ink">
          계정 만들기{" "}
          <span className="text-[11px] font-medium text-text-3">이메일로 가입</span>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름 (선택)"
          autoComplete="name"
          className="rounded-[12px] border border-[#e2e7ee] bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          autoComplete="email"
          className="rounded-[12px] border border-[#e2e7ee] bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 (8자 이상)"
          autoComplete="new-password"
          className="rounded-[12px] border border-[#e2e7ee] bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
        />
        <input
          type="password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          placeholder="비밀번호 확인"
          autoComplete="new-password"
          className="rounded-[12px] border border-[#e2e7ee] bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
        />
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

        {error && (
          <div
            role="alert"
            className="rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger"
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
