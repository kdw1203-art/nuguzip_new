"use client";

/* 지갑 출석 체크 — POST /api/me/attendance (하루 1회 +10P) → 결과 표시 + 잔액 새로고침 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { text: string; tone: "ok" | "info" | "error" };

export function AttendanceButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  async function checkIn() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/me/attendance", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        awarded?: number;
        alreadyChecked?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setMsg({ text: data.error ?? "출석 체크에 실패했어요.", tone: "error" });
        return;
      }
      if (data.alreadyChecked || !data.awarded) {
        setMsg({ text: "오늘은 이미 출석했어요", tone: "info" });
      } else {
        setMsg({ text: `+${data.awarded}P 적립!`, tone: "ok" });
      }
      // 서버 컴포넌트 재실행 → 잔액·내역 갱신
      router.refresh();
    } catch {
      setMsg({ text: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={checkIn}
        disabled={busy}
        className="btn-primary rounded-[12px] py-2.5 text-center text-sm disabled:opacity-60"
      >
        {busy ? "출석 확인 중…" : "출석 체크 +10P"}
      </button>
      {msg && (
        <div
          className={`text-center text-[12px] font-bold ${
            msg.tone === "error"
              ? "text-[#ff8a8a]"
              : msg.tone === "info"
                ? "text-ai-muted"
                : "text-[#7ea2ff]"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
