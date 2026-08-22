"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";

/* ============================================================
   뉴스·글 상세의 실제 동작하는 컨트롤 모음.

   ── 왜 만들었나 ─────────────────────────────────────────────
   상세 화면 위쪽에 "저장 12" · "공유" 가 알약 모양 <span> 으로 그려져 있었다.
   테두리와 패딩이 있어 버튼으로 읽히는데 onClick 도, href 도, form 도 없어서
   누르면 아무 일이 없었다. 댓글도 마찬가지로 입력칸처럼 생긴 <div> 안에
   "댓글 남기기…" 와 파란 "등록" 글자만 있었다 — 입력할 수도, 보낼 수도 없는
   댓글창이었다.

   셋 다 API 는 이미 있었다:
     저장 → POST/DELETE /api/bookmarks (type: "post")
     댓글 → POST /api/community/posts/[id]/comments
     공유 → Web Share API · 클립보드 폴백 (모임 공유 버튼과 같은 방식)
   없던 것은 화면과 API 를 잇는 이 파일뿐이라, 지우는 대신 연결했다.
   ============================================================ */

export function PostActions({
  postId,
  title,
  saveCount,
}: {
  postId: string;
  title: string;
  /** 서버가 센 실제 저장(북마크) 수 — 내 토글은 여기에 더하지 않는다(다음 렌더에 반영). */
  saveCount: number;
}) {
  const router = useRouter();
  const { promptSignup } = useSoftSignup();
  const { handleUpgradeResponse } = useUpgradePaywall();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /* 이미 저장한 글인지는 서버 렌더 시점에 알 수 없다(이 페이지는 공용 캐시가
     아니지만 세션별로 북마크를 조회하지는 않는다). 마운트 후 한 번만 확인해
     "저장"과 "저장됨"을 구분한다. 비로그인이면 빈 배열이 온다. */
  useEffect(() => {
    let alive = true;
    fetch("/api/bookmarks?type=post", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { items?: { targetId?: string }[] };
        if (alive && Array.isArray(data.items)) {
          setSaved(data.items.some((b) => b.targetId === postId));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [postId]);

  async function toggleSave() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = !saved;
    try {
      const res = next
        ? await fetch("/api/bookmarks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "post", id: postId, label: title }),
          })
        : await fetch(
            `/api/bookmarks?type=post&id=${encodeURIComponent(postId)}`,
            { method: "DELETE" },
          );
      if (res.status === 401) {
        promptSignup({
          action: "bookmark_post",
          title: "저장하려면 로그인이 필요해요",
          benefit: "로그인한 계정에만 저장 목록이 남아요. 나중에 마이페이지에서 다시 볼 수 있어요.",
        });
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        /* 고도화 33 — 한도 도달(quotaDeniedJson)은 다른 화면과 같은 공통
           페이월 모달로. 문구는 그대로 곁들여 보인다(모달을 닫아도 사유가 남게). */
        handleUpgradeResponse(res.status, data);
        setError(data.error ?? "잠시 후 다시 시도해 주세요.");
        return;
      }
      setSaved(next);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      /* 사용자가 공유 시트를 닫음 — 클립보드로 대체하지 않는다 */
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 클립보드 권한 없음 — 주소창의 주소를 그대로 쓰면 된다 */
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-2 text-[13px]">
      {error && (
        <span className="text-[11px] font-bold text-danger">{error}</span>
      )}
      <button
        type="button"
        onClick={() => void toggleSave()}
        disabled={busy}
        aria-pressed={saved}
        className={`press inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 font-semibold transition-colors disabled:opacity-50 ${
          saved ? "bg-primary-soft text-primary" : "btn-soft"
        }`}
      >
        <Icon name="bookmark" size={14} />
        {saved ? "저장됨" : "저장"} {saveCount}
      </button>
      <button
        type="button"
        onClick={() => void share()}
        className="press rounded-[10px] bg-[rgba(255,255,255,.7)] px-3.5 py-2 font-semibold text-text-2"
      >
        {copied ? "링크 복사됨 ✓" : "공유"}
      </button>
    </div>
  );
}

export function LikeButton({
  postId,
  initialCount,
}: {
  postId: string;
  initialCount: number;
}) {
  const { promptSignup } = useSoftSignup();
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/community/posts/${postId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.status === 401) {
        promptSignup({
          action: "post_like",
          title: "공감하려면 로그인이 필요해요",
          benefit: "로그인하면 공감이 계정에 남아 중복·어뷰징을 줄일 수 있어요.",
        });
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { liked?: boolean; likeCount?: number };
      if (typeof data.likeCount === "number") setCount(data.likeCount);
      if (typeof data.liked === "boolean") setLiked(data.liked);
    } catch {
      /* 네트워크 실패 — 숫자를 임의로 올리지 않는다. 다시 누르면 된다. */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={liked ?? false}
      className={`text-xs font-bold transition-colors disabled:opacity-50 ${
        liked ? "text-primary underline underline-offset-2" : "text-primary"
      }`}
    >
      도움돼요 {count}
    </button>
  );
}

export function CommentForm({ postId }: { postId: string }) {
  const router = useRouter();
  const { promptSignup } = useSoftSignup();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* [3차] 참여 적립 피드백 — 서버가 실제 지급한 값만 보여준다(상한·중복이면 0 → 미표시) */
  const [earned, setEarned] = useState<number>(0);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = body.trim();
    if (text.length < 1) {
      setError("댓글 내용을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.status === 401) {
        promptSignup({
          action: "community_comment",
          title: "댓글을 남기려면 로그인이 필요해요",
          benefit: "로그인하면 댓글이 계정에 남아 신고·차단 대응이 가능해요.",
        });
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "댓글 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        pointsAwarded?: number;
      } | null;
      if (typeof data?.pointsAwarded === "number" && data.pointsAwarded > 0) {
        setEarned(data.pointsAwarded);
        window.setTimeout(() => setEarned(0), 4000);
      }
      setBody("");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded-xl bg-bg px-3.5 py-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          aria-label="댓글 내용"
          placeholder="댓글 남기기…"
          className="min-w-0 flex-1 bg-transparent py-[6px] text-[13px] text-ink outline-none placeholder:text-text-3"
        />
        <button
          type="submit"
          disabled={busy || body.trim().length === 0}
          className="shrink-0 text-xs font-bold text-primary disabled:opacity-40"
        >
          {busy ? "등록 중…" : "등록"}
        </button>
      </div>
      {error && (
        <p role="alert" className="px-1 text-[11px] font-bold text-danger">
          {error}
        </p>
      )}
      {earned > 0 && (
        <p className="px-1 text-[11px] font-bold text-success">
          댓글 적립 +{earned}P — 포인트 내역에서 확인할 수 있어요
        </p>
      )}
      <p className="px-1 text-[10px] leading-[1.5] text-text-3">
        로그인 후 등록돼요 · 첫 댓글은 +20P · 개인정보(전화번호·계좌)는 적지 마세요
      </p>
    </form>
  );
}
