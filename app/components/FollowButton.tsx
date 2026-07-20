"use client";

/**
 * 임장러 팔로우 버튼 (당근/SNS 벤치마크) — user_follows 실배선
 * - 로그인 상태 확인은 GET /api/me/follows?checkHandle= (401 → 클릭 시 /login 이동)
 * - 팔로우: POST /api/me/follows { handle } · 언팔로우: DELETE (이메일 비노출)
 */
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export function FollowButton({ handle }: { handle: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "anon" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/me/follows?checkHandle=${encodeURIComponent(handle)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 401) {
          setState("anon");
          return;
        }
        if (!res.ok) {
          setState("off");
          return;
        }
        const data = (await res.json()) as { following?: boolean };
        setState(data.following ? "on" : "off");
      })
      .catch(() => alive && setState("off"));
    return () => {
      alive = false;
    };
  }, [handle]);

  const toggle = async () => {
    if (busy || state === "loading") return;
    if (state === "anon") {
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname ?? "/")}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/me/follows", {
        method: state === "on" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(pathname ?? "/")}`);
        return;
      }
      if (res.ok) setState(state === "on" ? "off" : "on");
    } catch {
      // 네트워크 실패 — 상태 유지
    } finally {
      setBusy(false);
    }
  };

  const following = state === "on";
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy || state === "loading"}
      aria-pressed={following}
      className={`mb-1 shrink-0 rounded-full px-4 py-[7px] text-[12px] font-bold transition-colors disabled:opacity-60 ${
        following
          ? "border border-line bg-surface text-text-2"
          : "bg-primary text-white"
      }`}
    >
      {state === "loading" ? "…" : following ? "팔로잉 ✓" : "팔로우"}
    </button>
  );
}
