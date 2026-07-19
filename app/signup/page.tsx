"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { trackPlatformEvent } from "@/lib/platform-events-client";

const GOALS = [
  { icon: "🏠", title: "첫 내집마련", desc: "실거주 관점 체크리스트 중심" },
  { icon: "📈", title: "투자 · 갈아타기", desc: "수익률·시세 흐름 중심" },
  { icon: "💼", title: "전문가 · 중개사", desc: "리포트 발행·상담 도구" },
] as const;

const SEGMENTS: { name: string; options: string[]; initial: string }[] = [
  { name: "나이대", options: ["20대", "30대", "40대", "50대+"], initial: "30대" },
  { name: "성별", options: ["남", "여"], initial: "남" },
  { name: "가구", options: ["1인 거주", "2인 거주", "3인 이상"], initial: "2인 거주" },
  { name: "직업", options: ["직장인", "사업자", "법인"], initial: "직장인" },
  { name: "생애최초", options: ["해당", "비해당"], initial: "해당" },
  { name: "보유 주택", options: ["무주택", "1주택", "2주택+"], initial: "무주택" },
];

const REGIONS = ["안양 관양동", "서울 마포구", "과천시"];

type RegisterResponse = {
  error?: string;
  detail?: string;
  emailConfirmationRequired?: boolean;
  user?: { id: string | number; email: string; name: string };
};

export default function SignupPage() {
  const [goal, setGoal] = useState(0);
  const [segments, setSegments] = useState<Record<string, string>>(
    Object.fromEntries(SEGMENTS.map((s) => [s.name, s.initial]))
  );
  const [regions, setRegions] = useState<string[]>(["안양 관양동"]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"done" | "confirm" | null>(null);

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

  const toggleRegion = (r: string) => {
    trackStep("signup_step_3", { section: "region" });
    setRegions((prev) =>
      prev.includes(r) ? prev.filter((v) => v !== r) : prev.length < 3 ? [...prev, r] : prev
    );
  };

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
        const detail = data.detail ? ` (${data.detail})` : "";
        setError(`${data.error ?? "가입에 실패했습니다."}${detail}`);
        return;
      }
      trackStep("signup_complete", {
        goal: GOALS[goal].title,
        emailConfirmationRequired: Boolean(data.emailConfirmationRequired),
      });
      setDone(data.emailConfirmationRequired ? "confirm" : "done");
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col justify-center gap-4 px-7 pb-8 pt-5">
        <div className="rise-in card flex flex-col items-center gap-3 rounded-[20px] p-7 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-xl">
            {done === "confirm" ? "✉️" : "✓"}
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
              </>
            ) : (
              <>이제 방금 만든 계정으로 로그인하면 맞춤 지표와 체크리스트가 준비됩니다.</>
            )}
          </p>
          <Link
            href="/login"
            className="btn-primary btn-cta mt-1 w-full rounded-2xl p-[15px] text-center text-base"
          >
            로그인하러 가기
          </Link>
          <Link href="/" className="text-xs text-text-3">
            나중에 할게요 · 홈으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col gap-4 px-7 pb-8 pt-5">
      <div className="flex items-center justify-between">
        <Link href="/login" className="text-base text-text-1" aria-label="뒤로">
          ‹
        </Link>
        <div className="relative h-1 w-[120px] rounded-sm bg-[#e9edf3]">
          <div className="absolute left-0 top-0 h-1 w-1/2 rounded-sm bg-primary" />
        </div>
        <Link href="/" className="text-[13px] text-text-3">
          건너뛰기
        </Link>
      </div>

      <h1 className="rise-in text-[22px] font-extrabold leading-[1.35] text-ink">
        어떤 집을 찾고 계세요?
      </h1>
      <p className="rise-in-1 -mt-2 text-[13px] text-text-2">맞춤 지표와 체크리스트를 준비해 드려요</p>

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
            <span className="text-xl">{g.icon}</span>
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
        <div className="text-[13px] font-extrabold text-ink">
          관심 지역 <span className="text-[11px] font-medium text-text-3">최대 3곳</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {REGIONS.map((r) => {
            const active = regions.includes(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRegion(r)}
                className={`rounded-full px-[13px] py-[7px] text-xs ${
                  active
                    ? "bg-primary-soft font-bold text-primary"
                    : "border border-[#e2e7ee] bg-surface text-text-2"
                }`}
              >
                {active ? "✓ " : ""}
                {r}
              </button>
            );
          })}
          <span className="rounded-full bg-[#f2f4f8] px-[13px] py-[7px] text-xs text-text-3">
            ⌕ 검색
          </span>
        </div>
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
        <div className="text-center text-xs text-[#adb5bd]">
          이미 계정이 있나요?{" "}
          <Link href="/login" className="font-bold text-primary">
            로그인
          </Link>
        </div>
      </form>
    </main>
  );
}
