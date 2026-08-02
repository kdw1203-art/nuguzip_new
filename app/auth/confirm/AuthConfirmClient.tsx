"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { safeInternalPath } from "@/lib/safe-path";

function safeNext(raw: string | null): string {
  /* `!startsWith("//")` 만으로는 `/\evil.com` 이 통과한다 — lib/safe-path.ts 참고. */
  return safeInternalPath(raw, "/login?verified=1");
}

export function AuthConfirmClient() {
  const router = useRouter();
  const [message, setMessage] = useState("이메일 인증을 확인하는 중…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const next = safeNext(url.searchParams.get("next"));
      const errorDesc =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error");

      if (errorDesc) {
        setMessage("인증 링크가 만료됐거나 이미 사용됐어요. 다시 로그인해 주세요.");
        window.setTimeout(() => router.replace("/login?error=verify_failed"), 1200);
        return;
      }

      /* PKCE — 서버 콜백이 쿠키를 심도록 넘긴다 */
      if (code) {
        window.location.replace(
          `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`,
        );
        return;
      }

      /* token_hash 방식 (일부 메일 템플릿) */
      if (tokenHash && type) {
        try {
          const supabase = createClient();
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "signup" | "email" | "recovery" | "invite" | "magiclink",
          });
          if (cancelled) return;
          if (error) {
            setMessage("인증에 실패했습니다. 로그인 화면으로 이동합니다.");
            window.setTimeout(() => router.replace("/login?error=verify_failed"), 1200);
            return;
          }
          setMessage("인증이 완료됐어요. 이동합니다…");
          window.setTimeout(() => router.replace(next), 800);
          return;
        } catch {
          if (!cancelled) {
            router.replace("/login?error=verify_failed");
          }
          return;
        }
      }

      /* 해시 토큰 (implicit) — 브릿지에서 넘어온 경우 */
      if (url.hash && url.hash.includes("access_token")) {
        try {
          const supabase = createClient();
          const { error } = await supabase.auth.getSession();
          if (cancelled) return;
          if (error) {
            router.replace("/login?error=verify_failed");
            return;
          }
          setMessage("인증이 완료됐어요. 이동합니다…");
          window.setTimeout(() => router.replace(next), 800);
          return;
        } catch {
          if (!cancelled) router.replace("/login?error=verify_failed");
          return;
        }
      }

      router.replace("/login");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col items-center justify-center gap-3 px-7">
      <p className="text-sm font-bold text-text-1">{message}</p>
    </main>
  );
}
