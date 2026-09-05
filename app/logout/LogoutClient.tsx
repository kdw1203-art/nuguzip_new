"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Logo } from "@/app/components/Logo";

export function LogoutClient() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    signOut({ callbackUrl: "/" }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col items-center justify-center gap-3 px-7">
      <Logo size={34} />
      <p role="status" className="t-body font-bold text-text-1">
        {failed ? "로그아웃에 실패했어요. 다시 시도해 주세요." : "로그아웃하는 중…"}
      </p>
      {failed && (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            void signOut({ callbackUrl: "/" }).catch(() => setFailed(true));
          }}
          className="btn-primary rounded-[10px] px-4 py-2 t-sub font-bold"
        >
          다시 시도
        </button>
      )}
      <Link href="/" className="t-sub text-text-3">
        홈으로
      </Link>
    </main>
  );
}
