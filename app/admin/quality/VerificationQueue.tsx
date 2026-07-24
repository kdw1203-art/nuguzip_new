"use client";

/* J2 — 전문가·소유확인 인증 심사 큐(실 대기열) 액션.
   전문가 신청은 이 자리에서 바로 승인/반려(PATCH /api/admin/experts). 오클릭 방지 2단계.
   소유확인 건은 매물 심사(/admin/listings)로 연결. 브라우저 confirm() 미사용. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/toast/ToastProvider";

export type QueueItem = {
  id: string;
  kind: "expert" | "owner";
  label: string;
  sub: string;
  createdAt: string | null;
};

function relDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function ExpertRow({ item }: { item: QueueItem }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [phase, setPhase] = useState<"idle" | "approve" | "reject" | "busy">("idle");
  const [reason, setReason] = useState("");

  async function submit(action: "approve" | "reject") {
    setPhase("busy");
    try {
      const res = await fetch("/api/admin/experts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          action,
          note: action === "reject" ? reason : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        showToast(json.error ?? "처리에 실패했어요");
        setPhase("idle");
        return;
      }
      showToast(action === "approve" ? "전문가 인증을 승인했어요" : "인증 신청을 반려했어요");
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요");
      setPhase("idle");
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] bg-bg px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-primary-soft px-1.5 py-px text-[9px] font-extrabold text-primary">
              전문가
            </span>
            <span className="truncate text-xs font-extrabold text-ink">{item.label}</span>
          </div>
          <div className="mt-0.5 truncate text-[9px] text-text-3">
            {item.sub}
            {item.createdAt ? ` · 신청 ${relDate(item.createdAt)}` : ""}
          </div>
        </div>
        {phase === "idle" && (
          <span className="flex flex-shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setPhase("approve")}
              className="rounded-[7px] bg-[#1a7f4e] px-2 py-1 text-[10px] font-extrabold text-white"
            >
              승인
            </button>
            <button
              type="button"
              onClick={() => setPhase("reject")}
              className="rounded-[7px] bg-[#fdecec] px-2 py-1 text-[10px] font-extrabold text-[#d64545]"
            >
              반려
            </button>
          </span>
        )}
      </div>

      {phase === "approve" && (
        <div className="flex items-center justify-end gap-1.5">
          <span className="mr-auto text-[10px] text-text-3">
            승인하면 전문가 프로필이 인증 상태로 공개돼요.
          </span>
          <button
            type="button"
            onClick={() => void submit("approve")}
            className="rounded-[7px] bg-[#1a7f4e] px-2.5 py-1 text-[10px] font-extrabold text-white"
          >
            승인 확정
          </button>
          <button
            type="button"
            onClick={() => setPhase("idle")}
            className="rounded-[7px] bg-[rgba(0,0,0,.06)] px-2 py-1 text-[10px] font-bold text-text-2"
          >
            취소
          </button>
        </div>
      )}

      {phase === "reject" && (
        <div className="flex items-center gap-1.5">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="반려 사유 (신청자에게 전달)"
            className="min-w-0 flex-1 rounded-[7px] border border-line bg-surface px-2 py-1 text-[11px] text-ink outline-none"
          />
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() => void submit("reject")}
            className="rounded-[7px] bg-[#d64545] px-2.5 py-1 text-[10px] font-extrabold text-white disabled:opacity-40"
          >
            반려 확정
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              setReason("");
            }}
            className="rounded-[7px] bg-[rgba(0,0,0,.06)] px-2 py-1 text-[10px] font-bold text-text-2"
          >
            취소
          </button>
        </div>
      )}

      {phase === "busy" && (
        <div className="text-right text-[10px] text-text-3">처리 중…</div>
      )}
    </div>
  );
}

export function VerificationQueue({ queue }: { queue: QueueItem[] }) {
  if (queue.length === 0) {
    return (
      <div className="rounded-[14px] bg-bg px-3.5 py-6 text-center text-[11px] text-text-3">
        현재 심사 대기 중인 신청이 없어요.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {queue.map((q) =>
        q.kind === "expert" ? (
          <ExpertRow key={`expert-${q.id}`} item={q} />
        ) : (
          <div
            key={`owner-${q.id}`}
            className="flex items-center justify-between gap-2 rounded-[10px] bg-bg px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-[#fdf3e7] px-1.5 py-px text-[9px] font-extrabold text-[#c07a3a]">
                  소유확인
                </span>
                <span className="truncate text-xs font-extrabold text-ink">{q.label}</span>
              </div>
              <div className="mt-0.5 truncate text-[9px] text-text-3">
                {q.sub}
                {q.createdAt ? ` · 신청 ${relDate(q.createdAt)}` : ""}
              </div>
            </div>
            <Link
              href="/admin/listings"
              className="flex-shrink-0 rounded-[7px] bg-primary px-2 py-1 text-[10px] font-extrabold text-white no-underline"
            >
              매물 심사 ›
            </Link>
          </div>
        ),
      )}
    </div>
  );
}
