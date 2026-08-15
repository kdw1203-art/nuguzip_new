"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "../../components/toast/ToastProvider";

/* 노트 상세 실동작 액션 (더미 버튼 제거)
   - 공유: 현재 URL 클립보드 복사 (실패 시 prompt 폴백) + 성공 토스트
   - 소유자: 수정(/notes/[id]/edit) + 공개/비공개 토글 — PATCH /api/inspection/notes/[id] */

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
  const { showToast } = useToast();
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [busy, setBusy] = useState(false);

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
    <div className="relative flex flex-wrap items-center gap-2">
      {/* 나만의 카드 — AI가 기록으로 자동 구성한 카드를 색상·장 선택으로 꾸민다.
          소유자는 '만들기', 공개 노트 열람자는 '카드 보기'. */}
      <Link
        href={`/notes/${noteId}/card`}
        className="btn-primary px-3.5 py-2 text-[13px] font-bold no-underline"
      >
        {isOwner ? "🎨 나만의 카드 만들기" : "🎴 카드 보기"}
      </Link>
      {isOwner && (
        <Link
          href={`/notes/${noteId}/edit`}
          className="btn-soft px-3.5 py-2 text-[13px] no-underline"
        >
          수정
        </Link>
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
