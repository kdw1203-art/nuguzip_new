"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/* 미션 청구 버튼 — 서버 재검증 후 지급. 성공 시 새로고침으로 claimed 반영. */
export function MissionClaim({
  kind,
  missionKey,
  points,
  disabled,
  claimed,
}: {
  kind: "start" | "ai" | "weekly";
  missionKey?: string;
  points: number;
  disabled: boolean;
  claimed: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  if (claimed) {
    return (
      <span className="rounded-full bg-success-soft px-3 py-1.5 text-[11px] font-extrabold text-success">
        적립 완료 ✓
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[11px] font-bold text-warning">{msg}</span>}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch("/api/missions/claim", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind, key: missionKey }),
            });
            const json: { ok?: boolean; awarded?: number; error?: string; reason?: string } =
              await res.json().catch(() => ({}));
            if (!res.ok) {
              setMsg(json.error ?? "청구 실패");
              return;
            }
            if (json.ok) router.refresh();
            else setMsg(json.reason === "cap" || json.reason === "rule_cap" ? "오늘 적립 상한에 도달했어요" : "이미 적립됐어요");
          } catch {
            setMsg("네트워크 오류");
          } finally {
            setBusy(false);
          }
        }}
        className={`rounded-full px-3.5 py-1.5 text-[11.5px] font-extrabold ${
          disabled ? "bg-bg text-text-3" : "bg-primary text-white"
        } disabled:opacity-60`}
      >
        {busy ? "확인 중…" : `+${points}P 받기`}
      </button>
    </div>
  );
}
