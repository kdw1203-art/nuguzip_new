"use client";

import Link from "next/link";
import { useEffect } from "react";

type UpgradePaywallProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  /** /subscription 쿼리 (utm 등) */
  href?: string;
  ctaLabel?: string;
};

/**
 * 공통 페이월 — 402/쿼터/플랜 부족 시 한곳에서 CTA.
 * 가짜 체험 기간·가격을 넣지 않는다.
 */
export function UpgradePaywall({
  open,
  onClose,
  title = "플랜 업그레이드",
  message,
  href = "/subscription",
  ctaLabel = "요금제 보기",
}: UpgradePaywallProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-paywall-title"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-[400px] rounded-[20px] px-5 py-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="upgrade-paywall-title" className="text-[16px] font-extrabold text-ink">
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-[1.65] text-text-2">{message}</p>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href={href}
            className="btn-primary btn-cta rounded-xl py-3 text-center text-[14px] no-underline"
            onClick={onClose}
          >
            {ctaLabel}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl py-2.5 text-[13px] font-semibold text-text-3"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
