"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { safeInternalPath } from "@/lib/safe-path";

/* 최적화 19 — supabase-js 는 실제로 쓰는 분기에서만 불러온다.
   정적 import 이던 시절 이 페이지의 First Load JS 는 169kB 였고 그중 약 66kB가
   @supabase/supabase-js 였다(auth 만 쓰는데 realtime·storage·functions 까지 온다).
   아래 다섯 갈래 중 supabase 가 필요한 건 token_hash · 해시토큰 둘뿐이고,
   PKCE(code)·오류·기타는 리다이렉트만 한다 — 그 경우엔 한 바이트도 안 받는다.
   필요한 분기에서도 "확인하는 중…" 문구가 먼저 그려진 뒤 내려받는다. */
const loadCreateClient = () =>
  import("@/utils/supabase/client").then((m) => m.createClient);

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
          const supabase = (await loadCreateClient())();
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
        /* [965] 비밀번호 재설정 링크(type=recovery)는 해시를 **그대로 들고**
           /reset-password 로 넘긴다. 예전엔 여기서 세션만 만들고 해시 없이
           이동해서, 재설정 화면은 PASSWORD_RECOVERY 신호를 받지 못해 4초 뒤
           "링크가 유효하지 않습니다" 를 그렸다 — 메일을 눌러도 비밀번호를 바꿀 수
           없는 상태였다. 재설정 화면은 해시 토큰을 스스로 처리한다. */
        if (next.startsWith("/reset-password")) {
          window.location.replace(`${next}${url.hash}`);
          return;
        }
        try {
          const supabase = (await loadCreateClient())();
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
      <p className="text-[13px] font-bold text-text-1">{message}</p>
    </main>
  );
}
