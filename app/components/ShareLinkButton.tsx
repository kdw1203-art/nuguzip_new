"use client";

import { Icon } from "@/app/components/Icon";
import { useCopy } from "@/lib/ui/use-copy";

/* [개선 #32] 범용 공유 버튼 — Web Share API 우선, 미지원 시 클립보드 복사 폴백.
 * [966] 정본으로 승격 — 노트 상세·동네 뉴스·모임 상세가 각자 들고 있던 같은 로직을
 * 여기로 모은다. 겉모습은 호출부가 className·variant·label 로 정하고, 이 파일은
 * "공유 시트 → 클립보드 → 토스트" 순서만 책임진다.
 *
 * 공유 시트를 사용자가 닫으면(AbortError) 아무것도 하지 않는다 — 그건 실패가 아니다.
 * 시트가 못 뜬 경우(NotAllowed 등)만 클립보드로 넘어간다. */

export type ShareLinkVariant = "chip" | "icon" | "text";

export function ShareLinkButton({
  title,
  text,
  url,
  label = "공유",
  copiedLabel = "복사됨 ✓",
  copiedMessage = "링크를 복사했어요",
  className = "",
  variant = "chip",
}: {
  /** 공유 시트 제목 — 없으면 문서 제목 */
  title?: string;
  /** 공유 시트 본문 — 없으면 title */
  text?: string;
  /** 공유할 주소(상대 경로 허용 — 누를 때 현재 origin 으로 푼다) — 없으면 현재 주소 */
  url?: string;
  /** 버튼 라벨(chip·text) · 접근성 이름(icon) */
  label?: string;
  /** 복사 직후 잠깐 바뀌는 라벨(chip·text) */
  copiedLabel?: string;
  /** 복사 성공 토스트 문구 */
  copiedMessage?: string;
  className?: string;
  /** chip: 아이콘+라벨(기본) · icon: 아이콘만 · text: 라벨만 */
  variant?: ShareLinkVariant;
}) {
  const { copy, copied } = useCopy(copiedMessage);

  const share = async () => {
    if (typeof window === "undefined") return;
    const shareUrl = url ? new URL(url, window.location.href).toString() : window.location.href;
    const shareTitle = title ?? document.title;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareTitle, text: text ?? shareTitle, url: shareUrl });
        return;
      } catch (e) {
        /* 시트를 닫은 것은 취소 — 클립보드로 대체하지 않는다 */
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copy(shareUrl);
  };

  const showLabel = copied ? copiedLabel : label;

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={className}
      aria-label={variant === "icon" ? showLabel : undefined}
      title={variant === "icon" ? label : undefined}
    >
      {variant !== "text" && <Icon name="share" size={14} />}
      {variant !== "icon" && showLabel}
    </button>
  );
}
