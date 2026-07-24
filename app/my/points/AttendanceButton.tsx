"use client";

/* 지갑 출석 체크 — POST /api/me/attendance (하루 1회 +10P) → 결과 표시 + 잔액 새로고침.
   B6: 마운트 시 GET 으로 연속 출석일·오늘 출석 여부를 읽어 스트릭을 표면화(재방문 동기). */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { text: string; tone: "ok" | "info" | "error" };

export function AttendanceButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [streak, setStreak] = useState(0);
  const [checkedToday, setCheckedToday] = useState(false);

  // 마운트 시 현재 스트릭·오늘 출석 여부 로드 (실패해도 버튼은 동작).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/attendance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { streak?: number; checkedToday?: boolean } | null) => {
        if (cancelled || !j) return;
        if (typeof j.streak === "number") setStreak(j.streak);
        if (typeof j.checkedToday === "boolean") setCheckedToday(j.checkedToday);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const checkIn = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/me/attendance", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        awarded?: number;
        alreadyChecked?: boolean;
        streak?: number;
        error?: string;
      };
      if (!res.ok) {
        setMsg({ text: data.error ?? "출석 체크에 실패했어요.", tone: "error" });
        return;
      }
      if (typeof data.streak === "number") setStreak(data.streak);
      setCheckedToday(true);
      if (data.alreadyChecked || !data.awarded) {
        setMsg({ text: "오늘은 이미 출석했어요", tone: "info" });
      } else {
        setMsg({ text: `+${data.awarded}P 적립!`, tone: "ok" });
      }
      router.refresh();
    } catch {
      setMsg({ text: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <div className="flex flex-col gap-2">
      {streak > 0 && (
        <div className="flex items-center justify-center gap-1.5 text-[12px] font-bold text-[#7ea2ff]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#7ea2ff]" />
          연속 출석 {streak}일{checkedToday ? " · 오늘 완료" : " · 오늘 이어가기"}
        </div>
      )}
      <button
        type="button"
        onClick={checkIn}
        disabled={busy || checkedToday}
        className="btn-primary rounded-[12px] py-2.5 text-center text-sm disabled:opacity-60"
      >
        {busy
          ? "출석 확인 중…"
          : checkedToday
            ? "오늘 출석 완료 ✓"
            : "출석 체크 +10P"}
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
