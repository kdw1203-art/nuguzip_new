import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { markFailed } from "@/lib/payments/store";

export const metadata: Metadata = {
  title: "결제 실패 | 누구집",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** 결제 실패·취소 리턴 페이지. (구 app/payment/fail 포트) */
export default async function PaymentFailPage({
  searchParams,
}: {
  searchParams: Promise<{
    orderId?: string;
    code?: string;
    message?: string;
    reason?: string;
    provider?: string;
  }>;
}) {
  const sp = await searchParams;
  if (sp.orderId) {
    try {
      await markFailed(sp.orderId);
    } catch {
      /* 기록 실패는 무시 — 안내는 그대로 노출 */
    }
  }

  return (
    <PageShell breadcrumb="구독 · 결제 결과">
      <section className="rise-in mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 pt-10 text-center">
        <span className="text-[44px]" aria-hidden>
          <Icon name="😵" size={40} />
        </span>
        <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-ink">
          결제가 완료되지 않았습니다
        </h1>
        <p className="text-sm leading-[1.6] text-text-2">
          {sp.message ?? "잠시 후 다시 시도해 주세요. 반복되면 고객센터로 문의해 주세요."}
        </p>
        {(sp.code || sp.reason || sp.orderId) && (
          <p className="text-xs text-text-3">
            주문번호 {sp.orderId ?? "-"}
            {sp.code ? ` · 코드 ${sp.code}` : ""}
            {sp.reason ? ` · 사유 ${sp.reason}` : ""}
          </p>
        )}
        <div className="mt-3 flex w-full flex-col gap-2.5">
          <Link
            href="/subscription"
            className="btn-primary rounded-[14px] p-[13px] text-center text-sm font-bold"
          >
            다시 시도하기
          </Link>
          <Link
            href="/support"
            className="rounded-[14px] border border-line bg-surface p-[13px] text-center text-sm font-bold text-text-1"
          >
            문의하기
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
