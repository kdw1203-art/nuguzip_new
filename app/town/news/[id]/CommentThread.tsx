"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CommentForm } from "./PostInteractions";

/* [#65·#66] 댓글 스레드 — 대댓글 1단계 + 글쓴이 채택.
 *
 * 이 상세 페이지는 ISR(공유 캐시)이라 서버 렌더는 뷰어를 모른다. 그래서
 * 채택 버튼 노출 여부만 클라이언트에서 GET /comments/adopt 로 확인한다
 * (세션 쿠키가 있을 때만 — 비로그인 방문자에게 요청을 낭비하지 않는다).
 * 권한 판정의 진실은 항상 서버 POST 가 다시 한다. */

export type ThreadComment = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  parentId?: string | null;
  adopted?: boolean;
};

function hasSessionCookie(): boolean {
  try {
    return /(?:^|;\s*)(?:__Secure-)?(?:next-auth|authjs)\.session-token=/.test(document.cookie);
  } catch {
    return false;
  }
}

export function CommentThread({
  postId,
  comments,
  relativeLabels,
}: {
  postId: string;
  comments: ThreadComment[];
  /** 서버에서 계산한 상대시각 라벨 (comment.id → "3시간 전") — 클라 재계산으로 인한 hydration 불일치 방지 */
  relativeLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [isAuthor, setIsAuthor] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busyAdopt, setBusyAdopt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSessionCookie()) return;
    let cancelled = false;
    fetch(`/api/community/posts/${postId}/comments/adopt`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { isAuthor?: boolean } | null) => {
        if (!cancelled && d?.isAuthor === true) setIsAuthor(true);
      })
      .catch(() => {
        /* 판정 실패 = 버튼 미노출. 채택 자체는 서버가 지키므로 안전하다. */
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function adopt(commentId: string) {
    if (busyAdopt) return;
    setBusyAdopt(commentId);
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${postId}/comments/adopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "채택에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusyAdopt(null);
    }
  }

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);
  // 채택된 댓글을 맨 위로 — 질문 글에서 정답이 먼저 보여야 한다
  const ordered = [...topLevel].sort((a, b) => Number(b.adopted === true) - Number(a.adopted === true));

  if (comments.length === 0) {
    return <p className="py-2 text-[13px] text-text-3">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-[12px] font-bold text-danger">
          {error}
        </p>
      )}
      {ordered.map((c) => (
        <div key={c.id} className="flex flex-col gap-2">
          <CommentRow
            c={c}
            label={relativeLabels[c.id] ?? ""}
            isAuthor={isAuthor}
            busy={busyAdopt === c.id}
            onAdopt={() => void adopt(c.id)}
            onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
            replying={replyTo === c.id}
          />
          {repliesOf(c.id).map((r) => (
            <div key={r.id} className="ml-9 border-l-2 border-line pl-3">
              <CommentRow c={r} label={relativeLabels[r.id] ?? ""} isAuthor={false} busy={false} />
            </div>
          ))}
          {replyTo === c.id && (
            <div className="ml-9">
              <CommentForm postId={postId} parentId={c.id} compact />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CommentRow({
  c,
  label,
  isAuthor,
  busy,
  onAdopt,
  onReply,
  replying,
}: {
  c: ThreadComment;
  label: string;
  isAuthor: boolean;
  busy: boolean;
  onAdopt?: () => void;
  onReply?: () => void;
  replying?: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-line to-bg" />
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-extrabold text-ink">{c.authorLabel}</span>
          {c.adopted && (
            <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10px] font-extrabold text-success">
              ✓ 채택된 답변
            </span>
          )}
          <span className="text-[10px] text-text-3">{label}</span>
        </div>
        <p className="text-[13px] leading-[1.55] text-text-1">{c.body}</p>
        <div className="flex items-center gap-3">
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="text-[12px] font-bold text-text-3"
            >
              {replying ? "답글 닫기" : "답글"}
            </button>
          )}
          {isAuthor && !c.adopted && onAdopt && (
            <button
              type="button"
              onClick={onAdopt}
              disabled={busy}
              className="text-[12px] font-bold text-primary disabled:opacity-50"
            >
              {busy ? "채택 중…" : "채택하기 (+30P)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
