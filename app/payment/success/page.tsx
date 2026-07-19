import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { markPaid } from "@/lib/payments/store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import { safeAuth } from "@/lib/safe-auth";
import type { AppPlan } from "@/lib/billing/plan";

export const metadata: Metadata = {
  title: "결제 완료 | 누구집",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * 토스·카카오페이 결제 성공 리다이렉트 처리. (구 app/payment/success 포트)
 * 쿼리로 전달된 paymentKey·orderId·amount 를 서버에서 Confirm API 에 전달합니다.
 */
export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    orderId?: string;
    paymentKey?: string;
    amount?: string;
    provider?: string;
    source?: string;
    campaign?: string;
  }>;
}) {
  const sp = await searchParams;
  const orderId = sp.orderId;
  const paymentKey = sp.paymentKey;
  const amount = sp.amount ? Number(sp.amount) : null;

  let status: "ok" | "mock" | "error" = "error";
  let message = "결제 정보를 확인할 수 없습니다.";

  if (sp.provider === "kakaopay" && orderId) {
    // 카카오페이는 /api/payments/kakaopay/approve 에서 승인·기록을 마치고 리다이렉트됩니다.
    status = "ok";
    message = "결제가 완료되어 구독이 활성화됐습니다.";
  } else if (orderId && paymentKey && amount) {
    try {
      const h = await headers();
      const origin = h.get("origin") ?? h.get("host") ?? "";
      const protocol = origin.startsWith("localhost") ? "http" : "https";
      const base = origin.startsWith("http") ? origin : `${protocol}://${origin}`;
      const res = await fetch(`${base}/api/payments/toss/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        status = "ok";
        message = "결제가 완료되어 구독이 활성화됐습니다.";
      } else {
        message = (data.error as string) ?? message;
      }
    } catch (e) {
      message = e instanceof Error ? e.message : message;
    }
  } else if (orderId) {
    // 클라이언트 측에서 paymentKey 없이 redirect 한 경우(=목업 재확정)
    if (process.env.NODE_ENV === "production") {
      status = "error";
      message = "결제 검증 정보가 누락되었습니다. 고객지원으로 문의해 주세요.";
    } else {
      const paid = await markPaid({ orderId, providerPaymentKey: "MOCK-PAYMENT-KEY" });
      if (paid) {
        const session = await safeAuth();
        // tier === "basic" 은 단품으로 간주 — 멤버십 등급은 변경하지 않는다.
        if (paid.plan !== "basic") {
          const plan: AppPlan = paid.plan;
          if (session?.user?.email) {
            await applyPlanToUserByEmail(session.user.email, plan);
          }
        }
        status = "mock";
        message = "결제가 기록되었습니다. (테스트 모드)";
      }
    }
  }

  const ok = status !== "error";
  return (
    <PageShell breadcrumb="구독 · 결제 결과">
      <section className="rise-in mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 pt-10 text-center">
        <span className="text-[44px]" aria-hidden>
          {ok ? "🎉" : "⚠️"}
        </span>
        <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-ink">
          {ok ? "결제가 완료되었습니다" : "결제 확인에 실패했습니다"}
        </h1>
        <p className="text-sm leading-[1.6] text-text-2">{message}</p>
        {orderId && <p className="text-xs text-text-3">주문번호 {orderId}</p>}
        <div className="mt-3 flex w-full flex-col gap-2.5">
          <Link href="/my" className="btn-primary rounded-[14px] p-[13px] text-center text-sm font-bold">
            마이 페이지
          </Link>
          <Link
            href="/subscription"
            className="rounded-[14px] border border-line bg-surface p-[13px] text-center text-sm font-bold text-text-1"
          >
            멤버십 안내
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
