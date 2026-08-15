"use client";

import { useState } from "react";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";

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
  const { promptSignup } = useSoftSignup();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  /* 상담 유형·희망 시간대 — DB(consult_type·preferred_time)와 전문가 답변 화면
     (/my/consultations)은 이미 이 값을 그리는데 폼이 안 보내서 항상 비어 있었다.
     연락처 자유입력은 넣지 않는다 — 아래 안내문(개인정보 기입 금지)과 모순되므로. */
  const [consultType, setConsultType] = useState<"text" | "call">("text");
  const [preferredTime, setPreferredTime] = useState("");
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
        body: JSON.stringify({
          message: text,
          consultType,
          preferredTime: preferredTime.trim() || undefined,
        }),
      });
      if (res.status === 401) {
        // 작성한 상담 내용을 날리지 않기 위해 이동 대신 프롬프트. status 는 되돌린다.
        setStatus("idle");
        promptSignup({
          action: "expert_consult",
          title: `${expertName} 님께 상담을 신청할까요?`,
          benefit:
            "상담은 계정으로 주고받아요. 가입하면 전문가 답변이 등록될 때 내 상담 내역에서 확인할 수 있습니다.",
          callbackUrl: "/town/experts",
        });
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        label={`${expertName} 상담 신청`}
        maxWidth={420}
        dismissOnBackdrop={status !== "sending"}
      >
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
            <ModalHeader
              title={`${expertName} 상담 신청`}
              onClose={() => setOpen(false)}
            />
            {/* 상담 유형 — 글 답변 / 전화 상담(플랫폼 안내 후 진행) */}
            <div className="flex gap-1.5" role="group" aria-label="상담 유형">
              {([
                { id: "text", label: "글로 답변 받기" },
                { id: "call", label: "전화 상담 요청" },
              ] as const).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setConsultType(o.id)}
                  aria-pressed={consultType === o.id}
                  className={`flex-1 rounded-xl px-3 py-2 text-[12px] font-bold transition ${
                    consultType === o.id
                      ? "bg-primary-soft text-primary ring-1 ring-primary/30"
                      : "border border-line bg-surface text-text-2"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="상담받고 싶은 내용을 구체적으로 적어주세요 (10자 이상). 임장노트 링크를 함께 붙이면 더 정확한 답변을 받을 수 있어요."
              className="w-full resize-none rounded-xl border border-line bg-bg p-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-text-3 focus:border-primary"
            />
            {consultType === "call" && (
              <input
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                maxLength={60}
                placeholder="통화 희망 시간대 (예: 평일 저녁 7시 이후)"
                aria-label="통화 희망 시간대"
                className="w-full rounded-xl border border-line bg-bg p-3 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
              />
            )}
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
      </Modal>
    </>
  );
}
