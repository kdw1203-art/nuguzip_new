"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";

/* 리포트 구매 — POST /api/creator/reports/[id]/buy (포인트 차감·구매 기록).
   성공하면 서버 컴포넌트를 새로고침해 '노트 열람' CTA 로 바뀐다. */
export function BuyReportButton({
  reportId,
  price,
  title,
}: {
  reportId: string;
  price: number;
  title: string;
}) {
  const router = useRouter();
  const { promptSignup } = useSoftSignup();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/creator/reports/${reportId}/buy`, { method: "POST" });
      if (res.status === 401) {
        setBusy(false);
        promptSignup({
          action: "report_buy",
          title: `‘${title}’ 리포트를 구매할까요?`,
          benefit: "구매한 리포트(연결된 임장노트)는 계정으로 언제든 다시 열람할 수 있어요.",
          callbackUrl: window.location.pathname,
        });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "구매에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void buy()}
        disabled={busy}
        className="btn-primary rounded-xl p-3.5 text-[14px] disabled:opacity-60"
      >
        {busy ? "구매 중…" : `${price.toLocaleString("ko-KR")}P 로 구매하고 노트 열람`}
      </button>
      {error && <p className="text-[11px] font-semibold text-danger">{error}</p>}
      <p className="text-[10px] leading-[1.6] text-text-3">
        구매 즉시 연결된 임장노트 전문을 열람할 수 있어요 · 포인트는 마이 › 포인트에서 확인
      </p>
    </div>
  );
}
