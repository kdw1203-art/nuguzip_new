"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Logo } from "@/app/components/Logo";
import { Icon } from "@/app/components/Icon";

/** 비밀번호 찾기 — 구 app/auth/forgot-password 포트 (기존 /api/auth/forgot-password 연결 유지) */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!email.trim().includes("@")) {
      setError("올바른 이메일 주소를 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "오류가 발생했습니다. 다시 시도해 주세요.");
        return;
      }
      setSent(true);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

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
          비밀번호 찾기
        </h1>
        <p className="rise-in-2 text-sm text-text-2">
          가입한 이메일로 비밀번호 초기화 링크를 보내드립니다
        </p>

        {sent ? (
          <div className="rise-in card flex flex-col gap-2.5 rounded-[16px] px-5 py-6 text-center">
            <Icon name="📬" size={28} />
            <div className="text-[15px] font-extrabold text-ink">메일을 보냈습니다</div>
            <p className="text-[13px] leading-[1.6] text-text-2">
              <strong className="text-ink">{email}</strong> 으로 비밀번호 초기화 링크를
              전송했습니다. 메일함을 확인해 주세요. (스팸 폴더도 확인해 보세요)
            </p>
            <ol className="mx-auto flex max-w-[280px] list-decimal flex-col gap-1 pl-5 text-left text-xs text-text-2">
              <li>이메일의 비밀번호 재설정 링크를 클릭하세요.</li>
              <li>새 비밀번호(8자 이상)를 입력해 변경을 완료하세요.</li>
              <li>완료 후 로그인 페이지에서 다시 접속하세요.</li>
            </ol>
            <Link
              href="/login"
              className="btn-primary mt-2 rounded-[12px] p-3 text-center text-sm font-bold"
            >
              로그인으로 돌아가기
            </Link>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              className="rounded-[12px] border border-line bg-surface p-3 text-center text-sm font-bold text-text-2"
            >
              다른 이메일로 다시 시도
            </button>
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
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="가입한 이메일 주소"
                autoComplete="email"
                className="rounded-[12px] border border-[#e2e7ee] bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={busy}
                className="btn-primary rounded-[12px] p-3 text-center text-sm font-bold disabled:opacity-60"
              >
                {busy ? "전송 중…" : "초기화 링크 보내기"}
              </button>
            </form>
            <p className="rise-in-4 text-xs text-text-3">
              링크 유효시간이 지나면 다시 요청해야 합니다.
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
