"use client";

/**
 * #1 매물 저장(관심) 토글 — 하트 버튼.
 * POST /api/bookmarks {type:"listing", id} / DELETE ?type=listing&id=.
 * 401 → 로그인 안내. 저장 목록은 /my/wishlist 에서 확인.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";

export function ListingSaveButton({
  listingId,
  label,
  initialSaved = false,
  className,
}: {
  listingId: string;
  label?: string | null;
  initialSaved?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { promptSignup } = useSoftSignup();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = !saved;
    try {
      const res = next
        ? await fetch("/api/bookmarks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "listing", id: listingId, label: label ?? null }),
          })
        : await fetch(
            `/api/bookmarks?type=listing&id=${encodeURIComponent(listingId)}`,
            { method: "DELETE" },
          );
      if (res.status === 401) {
        promptSignup({
          action: "bookmark_listing",
          title: "관심 매물을 저장하려면 로그인이 필요해요",
          benefit: "로그인하면 마이페이지 위시리스트에서 다시 볼 수 있어요.",
          callbackUrl: `/listings/${listingId}`,
        });
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
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

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? "관심 매물에서 제거" : "관심 매물로 저장"}
        className={`chip press inline-flex items-center gap-1.5 border px-3 py-1.5 text-[13px] font-bold transition-colors disabled:opacity-50 ${
          saved
            ? "border-danger bg-danger-soft text-danger"
            : "border-line bg-surface text-text-2 hover:border-danger hover:text-danger"
        } ${className ?? ""}`}
      >
        <Icon name="heart" size={15} style={saved ? { fill: "currentColor" } : undefined} />
        {saved ? "관심 저장됨" : "관심"}
      </button>
      {error && <span className="text-[12px] font-bold text-danger">{error}</span>}
    </div>
  );
}
