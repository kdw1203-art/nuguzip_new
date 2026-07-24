"use client";

/**
 * 매물 문의 폼 — 관심 구매/임차자가 등록자(중개사)에게 문의(리드)를 남긴다.
 * 로그인 필요. 등록자 본인에게는 노출하지 않는다(상위에서 isOwner 판정).
 * POST /api/listings/[id]/inquire
 */
import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/app/components/toast/ToastProvider";

const MESSAGE_MAX = 1000;

export function InquiryForm({
  listingId,
  loggedIn,
}: {
  listingId: string;
  loggedIn: boolean;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [phase, setPhase] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!loggedIn) {
    return (
      <Link
        href={`/login?callbackUrl=/listings/${listingId}`}
        className="btn-outline btn-md w-fit no-underline"
      >
        로그인 후 문의 남기기
      </Link>
    );
  }

  if (phase === "done") {
    return (
      <div className="rounded-xl bg-[rgba(26,127,78,.08)] px-4 py-3 text-[13px] font-bold text-[#1a7f4e]">
        문의를 남겼어요. 등록자가 확인하면 남겨 주신 연락처로 회신할 수 있어요.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-outline btn-md w-fit press"
      >
        문의 남기기
      </button>
    );
  }

  async function submit() {
    const body = message.trim();
    if (!body) {
      setError("문의 내용을 입력해 주세요.");
      return;
    }
    setPhase("busy");
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/inquire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: body, contact: contact.trim() || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "문의 접수에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setPhase("idle");
        return;
      }
      setPhase("done");
      showToast("문의를 남겼어요");
    } catch {
      setError("네트워크 오류로 문의를 남기지 못했어요.");
      setPhase("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
        rows={3}
        placeholder="궁금한 점(입주 가능일, 실제 상태, 방문 희망일 등)을 남겨 주세요."
        className="w-full resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13px] leading-[1.6] text-ink outline-none focus:border-primary"
      />
      <input
        value={contact}
        onChange={(e) => setContact(e.target.value.slice(0, 120))}
        placeholder="회신받을 연락처(선택) — 전화·카톡 등"
        className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13px] text-ink outline-none focus:border-primary"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-3">
          {message.length}/{MESSAGE_MAX}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="btn-ghost btn-sm"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={phase === "busy"}
            className="btn-primary btn-sm press disabled:opacity-50"
          >
            {phase === "busy" ? "보내는 중…" : "문의 보내기"}
          </button>
        </div>
      </div>
      {error && <span className="text-[11px] font-bold text-danger">{error}</span>}
      <p className="text-[11px] leading-[1.6] text-text-3">
        문의는 등록자(개업공인중개사)에게 전달돼요. 누구집은 중개 당사자가 아니에요.
      </p>
    </div>
  );
}
