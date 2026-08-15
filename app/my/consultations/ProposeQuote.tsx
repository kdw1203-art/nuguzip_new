"use client";

import { useState } from "react";

/* 견적 요청에 제안 보내기 — POST /api/market-requests/[id]/propose.
   성공하면 버튼이 '제안 보냄'으로 잠긴다(같은 요청에 반복 전송 억제 — 서버는
   시간당 10회 상한으로 한 번 더 막는다). */
export function ProposeQuote({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = message.trim();
    if (text.length < 10) {
      setError("제안 내용은 10자 이상 적어 주세요.");
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch(`/api/market-requests/${requestId}/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "전송에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setStatus("idle");
        return;
      }
      setStatus("done");
    } catch {
      setError("네트워크 오류가 발생했어요.");
      setStatus("idle");
    }
  };

  if (status === "done") {
    return (
      <span className="rounded-lg bg-success-soft px-3 py-1.5 text-[11px] font-extrabold text-success">
        ✓ 제안 보냄 — 요청자 알림으로 전달됐어요
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-primary w-fit rounded-lg px-3.5 py-1.5 text-[12px]"
        >
          제안 보내기
        </button>
      ) : (
        <>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="어떻게 도와드릴 수 있는지, 진행 방식과 예상 비용을 간단히 적어 주세요 (10자 이상). 요청자 알림으로 전달되고 내 프로필이 함께 연결돼요."
            className="w-full resize-none rounded-xl border border-line bg-bg p-3 text-[12.5px] leading-[1.6] text-ink outline-none placeholder:text-text-3 focus:border-primary"
          />
          {error && <div className="text-[11px] font-semibold text-danger">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void send()}
              disabled={status === "sending"}
              className="btn-primary rounded-lg px-3.5 py-1.5 text-[12px] disabled:opacity-60"
            >
              {status === "sending" ? "전송 중…" : "보내기"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-soft rounded-lg px-3.5 py-1.5 text-[12px]"
            >
              취소
            </button>
          </div>
        </>
      )}
    </div>
  );
}
