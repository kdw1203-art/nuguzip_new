"use client";

/**
 * 신고 연결 (#81) — 작은 "신고" 텍스트 버튼 → 사유 선택 → POST /api/moderation/content-report
 * (구 코드 components/report-post-form.tsx 패턴 이식, 새 디자인 토큰 적용)
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  { id: "spam", label: "스팸" },
  { id: "defamation", label: "욕설·비방" },
  { id: "fraud", label: "허위 정보" },
  { id: "other", label: "기타" },
] as const;

export function ReportButton({
  postId,
  commentId,
  className,
}: {
  postId: string;
  commentId?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  async function submit(category: (typeof CATEGORIES)[number]) {
    setBusy(true);
    setState("idle");
    try {
      const res = await fetch("/api/moderation/content-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          commentId: commentId ?? null,
          reason: `${category.label} 신고`,
          reportCategory: category.id,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("done");
      setOpen(false);
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  if (state === "done") {
    return (
      <span className={`text-[11px] font-bold text-[#1a7f4e] ${className ?? ""}`}>
        접수됨
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-[11px] text-text-3 underline decoration-line underline-offset-2 transition-colors hover:text-danger ${className ?? ""}`}
      >
        신고
      </button>
    );
  }

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 ${className ?? ""}`}
    >
      <span className="text-[10px] text-text-3">신고 사유:</span>
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={busy}
          onClick={() => void submit(c)}
          className="chip border border-line bg-surface px-2 py-0.5 text-[10px] font-bold text-text-2 transition-colors hover:border-danger hover:text-danger disabled:opacity-40"
        >
          {c.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setState("idle");
        }}
        className="text-[10px] text-text-3"
      >
        취소
      </button>
      {state === "error" && (
        <span className="text-[10px] font-bold text-danger">
          접수 실패 — 잠시 후 다시 시도해 주세요
        </span>
      )}
    </span>
  );
}
