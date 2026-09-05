"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/app/components/Logo";
import { Icon } from "@/app/components/Icon";
/* 최적화 19 — supabase-js 는 **필요할 때** 불러온다.
   정적 import 이던 시절 이 페이지의 First Load JS 는 181kB 였고, 그중 약 66kB가
   @supabase/supabase-js 였다(realtime·storage·functions 포함 — 여기서 쓰는 건
   auth 하나뿐인데도 통째로 들어온다).
   그런데 이 화면의 주 경로는 `?token=` 쿼리(자체 토큰)이고, 그 경로는 fetch 만
   쓰고 supabase 를 **한 번도 부르지 않는다**. 비밀번호 재설정 링크는 메일에서
   눌러 들어오는 자리라 첫 로드가 곧 체감이다 — 안 쓰는 66kB를 미리 받게 할
   이유가 없다. 그래서 supabase 복구 링크(hash) 경로에서만 동적으로 가져온다. */
const loadSupabase = () =>
  import("@/lib/supabase/browser").then((m) => m.createSupabaseBrowserClient());

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
    if (window.location.hash.includes("access_token")) {
      queueMicrotask(() => setMode("supabase"));
    }
    /* 4초 안에 아무 신호도 없으면 잘못된 링크로 본다. 이 타이머는 supabase 로드
       성공 여부와 무관하게 걸어 둔다 — 모듈을 못 받아 오면 "확인 중" 에서 영원히
       멈추는 화면이 되기 때문이다. */
    const timer = window.setTimeout(() => {
      setMode((m) => (m === "checking" ? "invalid" : m));
    }, 4000);
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const sb = await loadSupabase().catch(() => null);
      if (cancelled) return;
      if (!sb) {
        if (!window.location.hash.includes("access_token")) {
          setMode((m) => (m === "checking" ? "invalid" : m));
        }
        return;
      }
      const { data: sub } = sb.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          queueMicrotask(() => setMode("supabase"));
        }
      });
      /* 로드가 끝나기 전에 화면을 떠났을 수 있다 — 그때는 바로 해지한다 */
      if (cancelled) sub.subscription.unsubscribe();
      else unsubscribe = () => sub.subscription.unsubscribe();
      /* [965] token_hash(verifyOtp)·PKCE(/auth/callback) 경로는 세션이 **이미**
         쿠키에 있고 이 화면에서는 PASSWORD_RECOVERY 가 다시 나지 않는다.
         세션이 있으면 그 사용자가 비밀번호를 바꿀 수 있는 상태다 — 폼을 연다. */
      try {
        const { data: sess } = await sb.auth.getSession();
        if (!cancelled && sess.session) {
          setMode((m) => (m === "checking" ? "supabase" : m));
        }
      } catch {
        /* 세션 조회 실패는 타이머가 invalid 로 정리한다 */
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
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
        const sb = await loadSupabase().catch(() => null);
        if (!sb) {
          setError("클라이언트 설정을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }
        const { error: err } = await sb.auth.updateUser({ password });
        if (err) {
          setError(err.message ?? "비밀번호 변경에 실패했습니다.");
          return;
        }
        /* [965] 복구 링크로 생긴 임시 세션은 여기서 끝낸다 — 이 화면의 목적은
           비밀번호 변경이지 로그인이 아니고, 앱 세션은 Auth.js 쿠키가 따로 관리한다. */
        await sb.auth.signOut({ scope: "local" }).catch(() => {});
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
            ? "bg-success-fill"
            : strength.score >= 2
              ? "bg-warning"
              : "bg-danger"
          : "bg-bg"
      }`}
    />
  ));

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-7 pb-8"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
    >
      <div className="flex justify-end">
        <Link href="/login" className="text-[15px] text-text-3" aria-label="닫기">
          ✕
        </Link>
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-3.5">
        <div className="rise-in">
          <Logo size={34} />
        </div>
        <h1 className="rise-in-1 text-[21px] font-extrabold leading-[1.35] text-ink">
          새 비밀번호 설정
        </h1>
        <p className="rise-in-2 text-[13px] text-text-2">
          8자 이상, 대소문자·숫자·특수문자 조합을 권장합니다
        </p>

        {done ? (
          <div className="rise-in card flex flex-col gap-2.5 rounded-2xl px-5 py-6 text-center">
            <Icon name="✅" size={28} />
            <div className="text-[15px] font-extrabold text-ink">비밀번호가 변경되었습니다</div>
            <p className="text-[13px] text-text-2">3초 후 로그인 페이지로 이동합니다…</p>
            <Link
              href="/login"
              className="btn-primary mt-2 rounded-[10px] p-3 text-center text-[13px] font-bold"
            >
              지금 로그인하기
            </Link>
          </div>
        ) : mode === "checking" ? (
          <div className="rise-in card rounded-2xl px-5 py-6 text-center text-[13px] text-text-2">
            링크를 확인하는 중입니다…
          </div>
        ) : mode === "invalid" ? (
          <div className="rise-in card flex flex-col gap-2.5 rounded-2xl px-5 py-6 text-center">
            <Icon name="⚠" size={28} />
            <div className="text-[15px] font-extrabold text-ink">링크가 유효하지 않습니다</div>
            <p className="text-[13px] leading-[1.6] text-text-2">
              링크가 만료됐거나 이미 사용됐습니다. 이메일의 링크로 접근했는지 확인하고, 다시
              비밀번호 찾기를 요청해 주세요.
            </p>
            <Link
              href="/forgot-password"
              className="btn-primary mt-2 rounded-[10px] p-3 text-center text-[13px] font-bold"
            >
              비밀번호 찾기 다시 하기
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="rise-in rounded-[10px] bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger"
              >
                {error}
              </div>
            )}
            <form onSubmit={onSubmit} className="rise-in-3 flex flex-col gap-2">
              <div className="relative">
                <label htmlFor="reset-password-new" className="sr-only">
                  새 비밀번호
                </label>
                <input
                  id="reset-password-new"
                  type={showPw ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="새 비밀번호 (8자 이상)"
                  aria-describedby="reset-password-hint"
                  className="w-full rounded-[10px] border border-line bg-surface px-4 py-3 pr-14 text-[13px] text-ink outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-pressed={showPw}
                  aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
                  className="absolute inset-y-0 right-2 my-auto h-7 rounded-lg px-2 text-xs font-bold text-text-3"
                >
                  {showPw ? "숨김" : "표시"}
                </button>
              </div>
              {password && (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">{bars}</div>
                  <p id="reset-password-hint" className="text-[12px] text-text-3" aria-live="polite">
                    비밀번호 강도: {strength.hint}
                  </p>
                </div>
              )}
              <label htmlFor="reset-password-confirm" className="sr-only">
                비밀번호 확인
              </label>
              <input
                id="reset-password-confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="비밀번호 확인"
                aria-invalid={Boolean(password2) && password !== password2}
                className="rounded-[10px] border border-line bg-surface px-4 py-3 text-[13px] text-ink outline-none focus:border-primary"
              />
              {password2 && password !== password2 && (
                <p role="alert" className="text-[12px] font-bold text-danger">비밀번호가 일치하지 않습니다.</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="btn-primary rounded-[10px] p-3 text-center text-[13px] font-bold disabled:opacity-60"
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
        <div className="rise-in-5 text-center text-xs text-text-3">
          비밀번호가 기억났나요?{" "}
          <Link href="/login" className="font-bold text-primary">
            로그인
          </Link>
        </div>
      </div>
    </main>
  );
}
