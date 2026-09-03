"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-primary px-4 py-2 t-body font-bold text-white"
    >
      인쇄 / PDF 저장
    </button>
  );
}
