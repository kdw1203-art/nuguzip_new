"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../../components/toast/ToastProvider";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";

type Intent = "실거주" | "투자" | "전월세";
type InvestorRole = "live" | "invest" | "rent" | "balanced";

const ROLE_OPTIONS: { intent: Intent; role: InvestorRole; label: string }[] = [
  { intent: "실거주", role: "live", label: "실거주" },
  { intent: "투자", role: "invest", label: "투자" },
  { intent: "전월세", role: "rent", label: "전월세" },
  { intent: "실거주", role: "balanced", label: "균형" },
];

function defaultRole(intent: Intent): InvestorRole {
  if (intent === "투자") return "invest";
  if (intent === "전월세") return "rent";
  return "live";
}

/** 소유자용 — 저장 직후 AI 실패·규칙 폴백만 있을 때 재분석 */
export function AiRetryButton({
  noteId,
  defaultIntent = "실거주",
}: {
  noteId: string;
  defaultIntent?: Intent;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { handleUpgradeResponse } = useUpgradePaywall();
  const { promptSignup } = useSoftSignup();
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<InvestorRole>(() => defaultRole(defaultIntent));

  const run = async () => {
    if (busy) return;
    setBusy(true);
    const selected =
      ROLE_OPTIONS.find((o) => o.role === role) ?? ROLE_OPTIONS[0];
    try {
      const res = await fetch("/api/inspection/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId,
          force: true,
          intent: selected.intent,
          investorRole: selected.role,
        }),
      });
      if (res.status === 401) {
        promptSignup({
          action: "ai_retry",
          title: "AI 정리를 이어가려면 로그인",
          benefit: "저장한 임장노트를 AI로 다시 정리할 수 있어요.",
          callbackUrl: `/notes/${noteId}`,
        });
        return;
      }
      const json = (await res.json().catch(() => null)) as {
        code?: string;
        error?: string;
      } | null;
      if (handleUpgradeResponse(res.status, json)) {
        showToast("이번 달 AI 한도를 모두 사용했어요");
        return;
      }
      if (!res.ok) {
        showToast("AI 정리를 다시 시도하지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      showToast("AI 정리를 다시 실행했어요");
      router.refresh();
    } catch {
      showToast("네트워크 오류로 재분석을 못 했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {ROLE_OPTIONS.map((o) => {
          const active = role === o.role;
          return (
            <button
              key={o.role}
              type="button"
              disabled={busy}
              onClick={() => setRole(o.role)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold disabled:opacity-60 ${
                active
                  ? "bg-white/20 text-ai-accent"
                  : "bg-white/5 text-white/70"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="press inline-flex w-fit items-center rounded-lg bg-white/10 px-3 py-2 text-[12px] font-extrabold text-ai-accent disabled:opacity-60"
      >
        {busy ? "AI 정리 중…" : "AI 다시 정리하기"}
      </button>
    </div>
  );
}
