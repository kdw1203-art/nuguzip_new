"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/app/components/Logo";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * 새 비밀번호 설정 — 구 app/auth/reset-password 포트.
 * 두 가지 재설정 플로우를 모두 지원합니다.
 *  1) `?token=` 쿼리 — 자체 토큰 (/api/auth/reset-password GET 검증 → POST 변경)
 *  2) URL hash 의 access_token — Supabase Auth 복구 링크 (updateUser)
 */
type Mode = "checking" | "token" | "supabase" | "invalid";

function scorePassword(pw: string): { score: number; hint: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return {
    score,
    hint: ["매우 약함", "약함", "보통", "강함", "매우 강함"][score],
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("checking");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);

  useEffect(() => {
    const qsToken = new URLSearchParams(window.location.search).get("token") ?? "";
    if (qsToken) {
      setToken(qsToken);
      fetch(`/api/auth/reset-password?token=${encodeURIComponent(qsToken)}`)
        .then((r) => r.json())
        .then((d: { valid?: boolean }) => setMode(d.valid ? "token" : "invalid"))
        .catch(() => setMode("invalid"));
      return;
    }

    // Supabase 복구 링크 — hash 의 access_token 처리 대기
    const sb = createSupabaseBrowserClient();
    if (window.location.hash.includes("access_token")) {
      queueMicrotask(() => setMode("supabase"));
    }
    if (!sb) {
      if (!window.location.hash.includes("access_token")) {
        queueMicrotask(() => setMode("invalid"));
      }
      return;
    }
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        queueMicrotask(() => setMode("supabase"));
      }
    });
    const timer = window.setTimeout(() => {
      setMode((m) => (m === "checking" ? "invalid" : m));
    }, 4000);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (password !== password2) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "token") {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "비밀번호 변경에 실패했습니다.");
          return;
        }
      } else {
        const sb = createSupabaseBrowserClient();
        if (!sb) {
          setError("클라이언트 설정을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }
        const { error: err } = await sb.auth.updateUser({ password });
        if (err) {
          setError(err.message ?? "비밀번호 변경에 실패했습니다.");
          return;
        }
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch {
      setError("오류가 발생했습니다. 초기화 링크가 만료되었을 수 있습니다.");
    } finally {
      setBusy(false);
    }
  }

  const bars = [0, 1, 2, 3].map((i) => (
    <span
      key={i}
      className={`h-1 flex-1 rounded-full ${
        i < strength.score
          ? strength.score >= 3
            ? "bg-[#2f9e63]"
            : strength.score >= 2
              ? "bg-[#e2a33c]"
              : "bg-danger"
          : "bg-[#e9edf3]"
      }`}
    />
  ));

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-7 pb-8"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
    >
      <div className="flex justify-end">
        <Link href="/login" className="text-[17px] text-text-3" aria-label="닫기">
          ✕
        </Link>
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-3.5">
        <div className="rise-in">
          <Logo size={34} />
        </div>
        <h1 className="rise-in-1 text-[22px] font-extrabold leading-[1.35] text-ink">
          새 비밀번호 설정
        </h1>
        <p className="rise-in-2 text-sm text-text-2">
          8자 이상, 대소문자·숫자·특수문자 조합을 권장합니다
        </p>

        {done ? (
          <div className="rise-in card flex flex-col gap-2.5 rounded-[16px] px-5 py-6 text-center">
            <span className="text-[32px]" aria-hidden>
              ✅
            </span>
            <div className="text-[15px] font-extrabold text-ink">비밀번호가 변경되었습니다</div>
            <p className="text-[13px] text-text-2">3초 후 로그인 페이지로 이동합니다…</p>
            <Link
              href="/login"
              className="btn-primary mt-2 rounded-[12px] p-3 text-center text-sm font-bold"
            >
              지금 로그인하기
            </Link>
          </div>
        ) : mode === "checking" ? (
          <div className="rise-in card rounded-[16px] px-5 py-6 text-center text-sm text-text-2">
            링크를 확인하는 중입니다…
          </div>
        ) : mode === "invalid" ? (
          <div className="rise-in card flex flex-col gap-2.5 rounded-[16px] px-5 py-6 text-center">
            <span className="text-[32px]" aria-hidden>
              ⚠️
            </span>
            <div className="text-[15px] font-extrabold text-ink">링크가 유효하지 않습니다</div>
            <p className="text-[13px] leading-[1.6] text-text-2">
              링크가 만료됐거나 이미 사용됐습니다. 이메일의 링크로 접근했는지 확인하고, 다시
              비밀번호 찾기를 요청해 주세요.
            </p>
            <Link
              href="/forgot-password"
              className="btn-primary mt-2 rounded-[12px] p-3 text-center text-sm font-bold"
            >
              비밀번호 찾기 다시 하기
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="rise-in rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger"
              >
                {error}
              </div>
            )}
            <form onSubmit={onSubmit} className="rise-in-3 flex flex-col gap-2">
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="새 비밀번호 (8자 이상)"
                  className="w-full rounded-[12px] border border-[#e2e7ee] bg-surface px-4 py-3 pr-14 text-sm text-ink outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-2 my-auto h-7 rounded-lg px-2 text-xs font-bold text-text-3"
                >
                  {showPw ? "숨김" : "표시"}
                </button>
              </div>
              {password && (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">{bars}</div>
                  <p className="text-[11px] text-text-3">비밀번호 강도: {strength.hint}</p>
                </div>
              )}
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="비밀번호 확인"
                className="rounded-[12px] border border-[#e2e7ee] bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
              />
              {password2 && password !== password2 && (
                <p className="text-[11px] font-bold text-danger">비밀번호가 일치하지 않습니다.</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="btn-primary rounded-[12px] p-3 text-center text-sm font-bold disabled:opacity-60"
              >
                {busy ? "변경 중…" : "비밀번호 변경"}
              </button>
            </form>
            <p className="rise-in-4 text-xs text-text-3">
              새 비밀번호를 설정하면 즉시 적용됩니다.
            </p>
          </>
        )}

        <div className="flex-1" />
        <div className="rise-in-5 text-center text-xs text-[#adb5bd]">
          비밀번호가 기억났나요?{" "}
          <Link href="/login" className="font-bold text-primary">
            로그인
          </Link>
        </div>
      </div>
    </main>
  );
}
