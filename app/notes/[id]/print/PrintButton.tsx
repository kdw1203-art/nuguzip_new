"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-[#1d4fd8] px-4 py-2 text-[13px] font-bold text-white"
    >
      인쇄 / PDF 저장
    </button>
  );
}
