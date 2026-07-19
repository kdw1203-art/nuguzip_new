"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Logo } from "@/app/components/Logo";

type SocialProvider = "google" | "naver" | "kakao";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function socialSignIn(provider: SocialProvider) {
    setError(null);
    setBusy(provider);
    try {
      // OAuth는 리다이렉트 플로우 — 성공 시 / 로 돌아옵니다.
      await signIn(provider, { callbackUrl: "/" });
    } catch {
      setError("로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setBusy(null);
    }
  }

  async function passwordSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!email.trim().includes("@")) {
      setError("올바른 이메일을 입력해 주세요.");
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    setBusy("password");
    try {
      const res = await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: "/",
      });
      if (res?.error) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }
      if (res?.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      setError("로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-7 pb-8 pt-5">
      <div className="flex justify-end">
        <Link href="/" className="text-[17px] text-text-3" aria-label="닫기">
          ✕
        </Link>
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-3.5">
        <div className="rise-in">
          <Logo size={34} />
        </div>
        <h1 className="rise-in-1 text-[22px] font-extrabold leading-[1.35] text-ink">
          방금 쓴 노트,
          <br />
          잃어버리지 않게 저장할게요
        </h1>
        <p className="rise-in-2 text-sm text-text-2">3초 로그인 — 작성한 내용은 그대로 유지됩니다</p>

        <div className="rise-in-3 card flex items-center gap-2.5 rounded-[14px] px-4 py-3.5">
          <span className="text-[13px]">📝</span>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-ink">공작아파트 302동 · 오늘</div>
            <div className="text-[11px] text-text-3">체크 6항목 · 사진 4장 · 고려사항 2건</div>
          </div>
        </div>

        <div className="flex-1" />

        {error && (
          <div
            role="alert"
            className="rise-in rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger"
          >
            {error}
          </div>
        )}

        <form onSubmit={passwordSignIn} className="rise-in-3 flex flex-col gap-2">
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
            placeholder="비밀번호"
            autoComplete="current-password"
            className="rounded-[12px] border border-[#e2e7ee] bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy !== null}
            className="btn-primary rounded-[12px] p-3 text-center text-sm font-bold disabled:opacity-60"
          >
            {busy === "password" ? "로그인 중…" : "이메일로 로그인"}
          </button>
        </form>

        <div className="rise-in-4 flex items-center gap-3 text-[11px] text-[#adb5bd]">
          <span className="h-px flex-1 bg-[#e9edf3]" />
          또는
          <span className="h-px flex-1 bg-[#e9edf3]" />
        </div>

        <div className="rise-in-4 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => socialSignIn("kakao")}
            disabled={busy !== null}
            className="rounded-[14px] bg-[#fee500] p-3.5 text-center text-[15px] font-bold text-[#191919] disabled:opacity-60"
          >
            카카오로 3초 만에 시작
          </button>
          <button
            type="button"
            onClick={() => socialSignIn("naver")}
            disabled={busy !== null}
            className="rounded-[14px] bg-[#03c75a] p-3.5 text-center text-[15px] font-bold text-white disabled:opacity-60"
          >
            네이버로 시작
          </button>
          <button
            type="button"
            onClick={() => socialSignIn("google")}
            disabled={busy !== null}
            className="rounded-[14px] border border-[#e2e7ee] bg-surface p-3.5 text-center text-[15px] font-bold text-text-1 disabled:opacity-60"
          >
            Google로 시작
          </button>
        </div>
        <div className="rise-in-5 text-center text-xs text-[#adb5bd]">
          처음이신가요?{" "}
          <Link href="/signup" className="font-bold text-primary">
            회원가입 온보딩
          </Link>
        </div>
        <p className="text-center text-[11px] leading-[1.6] text-[#adb5bd]">
          시작하면 이용약관·개인정보처리방침에 동의하게 됩니다
        </p>
      </div>
    </main>
  );
}
