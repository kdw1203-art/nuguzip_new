"use client";

/**
 * 상담 후기 작성 (953) — 답변이 도착한 상담에 별점(1~5) + 한 줄 후기.
 * POST /api/experts/[expertId]/reviews  body: { consultationId, rating, comment? }
 * 저장되면 전문가 프로필의 평점·후기 수가 즉시 갱신되고, 이 카드는 "후기 남김"으로 잠긴다.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";

const COMMENT_MAX = 300;
const RATING_LABEL = ["", "아쉬워요", "그저 그래요", "괜찮아요", "좋아요", "아주 좋아요"] as const;

export function ReviewForm({
  expertId,
  expertName,
  consultationId,
}: {
  expertId: string;
  expertName: string;
  consultationId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (rating < 1) {
      setError("별점을 골라 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/experts/${expertId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId, rating, comment: comment.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "후기를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
        setBusy(false);
        return;
      }
      setDone(true);
      showToast("후기를 남겼어요 — 전문가 프로필에 반영됐어요");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
      setBusy(false);
    }
  };

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-success-soft chip-pad t-sub font-extrabold text-success">
        <Icon name="check" size={12} /> 후기 남김
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary btn-sm press inline-flex items-center gap-1"
      >
        <Icon name="star" size={12} /> 후기 남기기
      </button>
    );
  }

  const shown = hover || rating;

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-2xl border border-line bg-bg p-3.5">
      <div className="t-sub font-extrabold text-ink">{expertName} 님과의 상담은 어땠나요?</div>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5" role="radiogroup" aria-label="별점">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}점`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(n)}
              className={`press rounded-md p-0.5 ${n <= shown ? "text-brand-red" : "text-line-strong"}`}
            >
              <Icon name="star" size={22} />
            </button>
          ))}
        </div>
        <span className="t-sub font-semibold text-text-2">{shown > 0 ? RATING_LABEL[shown] : "별점을 골라 주세요"}</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
        rows={3}
        placeholder="답변이 어떤 점에서 도움이 됐는지 적어 주세요 (선택 · 전화번호·계좌는 적을 수 없어요)"
        className="w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="t-caption text-text-3">
          {comment.length}/{COMMENT_MAX} · 후기는 공개돼요(닉네임 마스킹)
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="btn-primary btn-sm press disabled:opacity-50"
          >
            {busy ? "저장 중…" : "후기 등록"}
          </button>
        </div>
      </div>
      {error && <span className="t-sub font-bold text-danger">{error}</span>}
    </div>
  );
}
