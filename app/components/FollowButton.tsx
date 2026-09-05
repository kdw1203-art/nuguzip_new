"use client";

/**
 * 임장러 팔로우 버튼 (당근/SNS 벤치마크) — user_follows 실배선
 * - 로그인 상태 확인은 GET /api/me/follows?checkHandle= (401 → A3 소프트 가입 프롬프트)
 * - 팔로우: POST /api/me/follows { handle } · 언팔로우: DELETE (이메일 비노출)
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useToast } from "@/app/components/toast/ToastProvider";

export function FollowButton({ handle }: { handle: string }) {
  const pathname = usePathname();
  const { promptSignup } = useSoftSignup();
  const { showToast } = useToast();
  const [state, setState] = useState<"loading" | "anon" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);

  const askSignup = () =>
    promptSignup({
      action: "follow_user",
      title: "이 임장러를 팔로우할까요?",
      benefit: "가입하면 이 사람이 새 임장노트를 공개할 때 피드에서 먼저 볼 수 있어요.",
      callbackUrl: pathname ?? "/",
    });

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
      askSignup();
      return;
    }
    setBusy(true);
    /* [966] 결과를 토스트로 — 버튼 라벨만 바뀌면 작은 화면에서 눈에 안 띈다.
       낙관적 갱신이 아니라 응답 후 반영이므로 실패 시 되돌릴 상태는 없다. */
    const next = state === "on" ? "off" : "on";
    try {
      const res = await fetch("/api/me/follows", {
        method: state === "on" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      if (res.status === 401) {
        askSignup();
        return;
      }
      if (!res.ok) {
        showToast("처리하지 못했어요. 다시 시도해 주세요");
        return;
      }
      setState(next);
      showToast(next === "on" ? "팔로우했어요" : "팔로우를 해제했어요");
    } catch {
      showToast("처리하지 못했어요. 다시 시도해 주세요");
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
