"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 결제 환불 버튼 — paid 건에만 렌더된다.
 *
 * 두 가지 모드 (약관 제8조):
 *  - 전액 환불: 결제 후 7일 이내 청약철회 처리.
 *  - 일할 환불: 중도 해지 — 잔여 기간을 일할 계산해 부분 취소.
 *    추천 금액 = 결제액 × 잔여일 / 기간일 (주간 7 · 월간 30 · 연간 365).
 *    금액은 관리자가 최종 확인·수정한다(서버가 1원~결제액 범위를 재검증).
 *
 * 성공 시 router.refresh 로 표를 다시 그린다(낙관적 갱신 없음 — 장부는
 * 서버가 확정한 상태만 보여준다). 두 모드 모두 플랜은 free 로 회수된다.
 */
export function CancelPaymentButton({
  orderId,
  amount,
  billing,
  paidAt,
}: {
  orderId: string;
  amount: number;
  billing: "weekly" | "monthly" | "annual";
  paidAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"full" | "prorate">("full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalDays = billing === "weekly" ? 7 : billing === "annual" ? 365 : 30;
  const paidMs = paidAt ? Date.parse(paidAt) : NaN;
  const usedDays = Number.isFinite(paidMs)
    ? Math.min(totalDays, Math.max(1, Math.ceil((Date.now() - paidMs) / 86_400_000)))
    : totalDays;
  const remainDays = Math.max(0, totalDays - usedDays);
  const suggested = Math.max(0, Math.floor((amount * remainDays) / totalDays));
  const [prorate, setProrate] = useState<string>(String(suggested));

  const refundAmount = mode === "full" ? amount : Number(prorate);
  const valid =
    Number.isInteger(refundAmount) && refundAmount >= 1 && refundAmount <= amount;

  async function run() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, amount: refundAmount }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        warning?: string;
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "환불에 실패했어요.");
        return;
      }
      if (j.warning) setError(j.warning);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-soft btn-sm rounded-lg px-2.5 py-1 text-[11px] font-bold text-danger"
        >
          환불
        </button>
        {error && <span className="max-w-[220px] text-right text-[10px] text-danger">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex w-[240px] flex-col gap-1.5 rounded-lg border border-line bg-surface p-2 text-left">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setMode("full")}
          className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-bold ${
            mode === "full" ? "bg-primary text-white" : "bg-[rgba(0,0,0,.04)] text-text-2"
          }`}
        >
          전액(청약철회)
        </button>
        <button
          type="button"
          onClick={() => setMode("prorate")}
          className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-bold ${
            mode === "prorate" ? "bg-primary text-white" : "bg-[rgba(0,0,0,.04)] text-text-2"
          }`}
        >
          일할(중도해지)
        </button>
      </div>
      {mode === "prorate" ? (
        <>
          <input
            type="number"
            min={1}
            max={amount}
            value={prorate}
            onChange={(e) => setProrate(e.target.value)}
            className="w-full rounded-md border border-line px-2 py-1 text-right text-[12px] font-bold"
          />
          <p className="text-[10px] leading-[1.5] text-text-3">
            기간 {totalDays}일 중 {usedDays}일 사용 · 잔여 {remainDays}일 → 추천{" "}
            {suggested.toLocaleString("ko-KR")}원
          </p>
        </>
      ) : (
        <p className="text-[10px] leading-[1.5] text-text-3">
          결제액 {amount.toLocaleString("ko-KR")}원 전액을 토스에 취소 요청합니다.
        </p>
      )}
      <p className="text-[10px] leading-[1.5] text-text-2">
        실행 시 토스 취소 후 장부를 환불로 기록하고 플랜을 회수합니다.
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !valid}
          className="btn-soft btn-sm flex-1 rounded-md px-2 py-1 text-[11px] font-bold text-danger disabled:opacity-50"
        >
          {busy
            ? "처리 중…"
            : valid
              ? `${refundAmount.toLocaleString("ko-KR")}원 환불 실행`
              : "금액 확인 필요"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="btn-soft btn-sm rounded-md px-2 py-1 text-[11px] font-bold"
        >
          닫기
        </button>
      </div>
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </div>
  );
}
