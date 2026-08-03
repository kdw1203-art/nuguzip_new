"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

/**
 * 토스 인가 코드 → NextAuth 세션.
 *
 * 토스가 redirect_uri 로 authorizationCode(문서에 따라 code)와 우리가 보낸
 * state(돌아갈 상대경로)를 실어 보낸다. 코드를 "toss" Credentials 프로바이더에
 * 넘기면 서버(auth.ts)가 토큰 교환·복호화·계정 연결까지 처리한다.
 *
 * 인가 코드는 일회용이다 — StrictMode 재실행·새로고침으로 두 번 보내면
 * 두 번째는 반드시 실패하므로 ref 로 한 번만 실행한다.
 */
export function TossCallbackClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const ranRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const code = (sp.get("authorizationCode") ?? sp.get("code") ?? "").trim();
    const referrer = (sp.get("referrer") ?? "DEFAULT").trim() || "DEFAULT";
    const state = sp.get("state") ?? "/";
    const dest = state.startsWith("/") && !state.startsWith("//") ? state : "/";

    if (!code) {
      setFailed(true);
      return;
    }

    void (async () => {
      try {
        const res = await signIn("toss", {
          authorizationCode: code,
          referrer,
          redirect: false,
        });
        if (res?.ok) {
          router.replace(dest);
          router.refresh();
        } else {
          setFailed(true);
        }
      } catch {
        setFailed(true);
      }
    })();
  }, [sp, router]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-bg px-6">
      <div className="w-full max-w-[360px] rounded-[20px] border border-line bg-surface p-6 text-center shadow-[0_10px_30px_rgba(16,28,54,.08)]">
        {failed ? (
          <>
            <p className="text-[15px] font-extrabold text-ink">
              토스 로그인에 실패했어요
            </p>
            <p className="mt-2 text-[12px] leading-[1.7] text-text-3">
              인증이 취소됐거나 코드가 만료됐을 수 있어요. 다시 시도해 주세요.
            </p>
            <Link
              href="/login"
              className="btn-primary btn-cta mt-4 block rounded-xl p-3 text-[13px] font-extrabold text-white"
            >
              로그인 화면으로
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#3182f6] border-t-transparent" />
            <p className="mt-3 text-[14px] font-extrabold text-ink">
              토스 로그인 처리 중…
            </p>
            <p className="mt-1 text-[12px] text-text-3">잠시만 기다려 주세요</p>
          </>
        )}
      </div>
    </main>
  );
}
