"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* 노트 상세 실동작 액션 (더미 버튼 제거)
   - 공유: 현재 URL 클립보드 복사 (실패 시 prompt 폴백) + 성공 토스트
   - 소유자: 공개/비공개 토글 — PATCH /api/inspection/notes/[id] { isPublic } */

export function NoteDetailActions({
  noteId,
  isOwner,
  initialIsPublic,
}: {
  noteId: string;
  isOwner: boolean;
  initialIsPublic: boolean;
}) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2200);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast("링크가 복사됐어요");
    } catch {
      // 클립보드 권한 없음 등 — 수동 복사 폴백
      window.prompt("아래 링크를 복사해 공유하세요", url);
    }
  };

  const toggleVisibility = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/inspection/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !isPublic }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        showToast("전환에 실패했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      const next = !isPublic;
      setIsPublic(next);
      showToast(next ? "공개 노트로 전환했어요" : "비공개로 전환했어요");
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      {toast && (
        <span className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-white">
          {toast}
        </span>
      )}
      {isOwner && (
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={busy}
          className="btn-soft px-3.5 py-2 text-[13px] disabled:opacity-60"
        >
          {busy ? "전환 중…" : isPublic ? "비공개로 전환" : "공개로 전환"}
        </button>
      )}
      <button
        type="button"
        onClick={share}
        className="btn-soft px-3.5 py-2 text-[13px]"
      >
        공유 링크
      </button>
    </div>
  );
}
