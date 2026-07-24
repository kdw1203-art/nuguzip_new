"use client";

/**
 * 전문가 상담 답변 — 전문가 본인이 받은 상담에 답변을 등록/수정한다.
 * PATCH /api/experts/[expertId]/consult  body: { consultationId, replyMessage }
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/toast/ToastProvider";

const REPLY_MAX = 2000;

export function ConsultReply({
  expertId,
  consultationId,
  existingReply,
}: {
  expertId: string;
  consultationId: string;
  existingReply: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(existingReply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const body = reply.trim();
    if (!body) {
      setError("답변 내용을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/experts/${expertId}/consult`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId, replyMessage: body }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "답변 등록에 실패했어요.");
        setBusy(false);
        return;
      }
      showToast("답변을 등록했어요");
      setOpen(false);
      router.refresh();
    } catch {
      setError("네트워크 오류로 답변을 등록하지 못했어요.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${existingReply ? "btn-outline" : "btn-primary"} btn-sm press`}
      >
        {existingReply ? "답변 수정" : "답변하기"}
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value.slice(0, REPLY_MAX))}
        rows={4}
        placeholder="상담 답변을 작성해 주세요. 신청자에게 전달됩니다."
        className="w-full resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13px] leading-[1.6] text-ink outline-none focus:border-primary"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-3">
          {reply.length}/{REPLY_MAX}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
              setReply(existingReply ?? "");
            }}
            className="btn-ghost btn-sm"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="btn-primary btn-sm press disabled:opacity-50"
          >
            {busy ? "등록 중…" : "답변 등록"}
          </button>
        </div>
      </div>
      {error && <span className="text-[11px] font-bold text-danger">{error}</span>}
    </div>
  );
}
