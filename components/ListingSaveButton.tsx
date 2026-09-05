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
import { useToast } from "@/app/components/toast/ToastProvider";

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
  const { showToast } = useToast();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = !saved;
    /* [966] 실패는 인라인 문구 + 토스트 둘 다 — 카드 목록에서는 버튼 아래 문구가
       가려지는 자리가 있어 토스트가 보조한다. 성공은 토스트에 목록 링크를 싣는다. */
    const fail = (msg: string) => {
      setError(msg);
      showToast(msg);
    };
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
        fail(data.error ?? "저장하지 못했어요. 다시 시도해 주세요");
        return;
      }
      setSaved(next);
      if (next) showToast("관심 매물로 저장했어요", { label: "목록 보기", href: "/my/wishlist" });
      else showToast("관심 매물에서 뺐어요");
      router.refresh();
    } catch {
      fail("네트워크 오류가 발생했어요. 다시 시도해 주세요");
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
            ? "border-brand-red bg-brand-hanji text-brand-red"
            : "border-line bg-surface text-text-2 hover:border-brand-red hover:text-brand-red"
        } ${className ?? ""}`}
      >
        {/* [961] 관심 등록 — 하트가 채워지며 주홍 파문 한 번(마커 선택과 같은 리듬) */}
        <span className="relative inline-flex">
          <Icon name="heart" size={15} style={saved ? { fill: "currentColor" } : undefined} />
          {saved && <span key="burst" className="njn-burst" aria-hidden="true" />}
        </span>
        {saved ? "관심 저장됨" : "관심"}
      </button>
      {error && <span className="text-[12px] font-bold text-danger">{error}</span>}
    </div>
  );
}
