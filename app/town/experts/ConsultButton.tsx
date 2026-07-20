"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/* P1-6: 죽어 있던 상담 버튼 실배선 — POST /api/experts/[id]/consult
   비로그인(401) → /login?callbackUrl= 이동. 실제 write 성공 시에만 완료 표시 */

export function ConsultButton({
  expertId,
  expertName,
  className = "btn-primary flex-1 rounded-xl p-[11px] text-[13px]",
}: {
  expertId: string;
  expertName: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const text = message.trim();
    if (text.length < 10) {
      setError("상담 내용은 10자 이상 입력해 주세요.");
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch(`/api/experts/${expertId}/consult`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, consultType: "text" }),
      });
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent("/town/experts")}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "상담 신청에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setStatus("idle");
        return;
      }
      setStatus("done");
    } catch {
      setError("상담 신청에 실패했어요. 네트워크를 확인해 주세요.");
      setStatus("idle");
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        상담 신청
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(16,24,40,.4)] backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`${expertName} 상담 신청`}
        >
          <div className="w-full max-w-[420px] rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
            {status === "done" ? (
              <div className="flex flex-col items-center gap-2.5 py-4 text-center">
                <div className="text-[15px] font-extrabold text-ink">
                  상담 신청이 접수됐어요
                </div>
                <p className="text-xs leading-[1.6] text-text-2">
                  {expertName} 님이 확인 후 답변을 보내드려요.
                  <br />
                  답변은 알림으로 안내됩니다.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setMessage("");
                    setStatus("idle");
                  }}
                  className="btn-primary mt-1 rounded-xl px-6 py-2.5 text-[13px]"
                >
                  확인
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-ink">
                    {expertName} 상담 신청
                  </span>
                  <button
                    type="button"
                    aria-label="닫기"
                    onClick={() => setOpen(false)}
                    className="text-[15px] text-text-3"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="상담받고 싶은 내용을 구체적으로 적어주세요 (10자 이상). 임장노트 링크를 함께 붙이면 더 정확한 답변을 받을 수 있어요."
                  className="w-full resize-none rounded-xl border border-line bg-bg p-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-text-3 focus:border-primary"
                />
                {error && (
                  <div className="text-[11px] font-semibold text-danger">{error}</div>
                )}
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={status === "sending"}
                  className="btn-primary rounded-xl p-3 text-[13px] disabled:opacity-60"
                >
                  {status === "sending" ? "신청 중…" : "상담 신청하기"}
                </button>
                <p className="text-[10px] leading-[1.5] text-text-3">
                  개인정보(전화번호·계좌)는 적지 마세요 · 플랫폼 밖 결제 유도는
                  신고 대상입니다
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
