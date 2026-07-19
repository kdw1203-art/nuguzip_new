import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import { normalizePlan } from "@/lib/billing/plan";
import { getStripe } from "@/lib/billing/stripe";
import { safeAuth } from "@/lib/safe-auth";

export const metadata: Metadata = {
  title: "구독 결제 완료 | 누구집",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Stripe Checkout 성공 리다이렉트. (구 app/billing/success 포트)
 * Webhook 과 병행해 session_id 로 플랜을 idempotent 하게 반영합니다.
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; source?: string; campaign?: string }>;
}) {
  const sp = await searchParams;
  const sessionId = sp.session_id?.trim();
  const auth = await safeAuth();

  let status: "ok" | "pending" | "error" = "error";
  let message = "결제 세션을 확인할 수 없습니다.";

  if (sessionId) {
    const stripe = getStripe();
    if (stripe) {
      try {
        const checkout = await stripe.checkout.sessions.retrieve(sessionId);
        if (checkout.payment_status === "paid" || checkout.status === "complete") {
          const email = String(
            checkout.metadata?.email ||
              checkout.customer_details?.email ||
              checkout.customer_email ||
              auth?.user?.email ||
              "",
          )
            .trim()
            .toLowerCase();
          const plan = normalizePlan(checkout.metadata?.plan);
          if (email && plan !== "free") {
            await applyPlanToUserByEmail(email, plan);
          }
          status = "ok";
          message = "구독 결제가 완료되었습니다. 잠시 후 마이 페이지에서 플랜을 확인해 주세요.";
        } else {
          status = "pending";
          message = "결제 확인 중입니다. Webhook 반영까지 1~2분 걸릴 수 있습니다.";
        }
      } catch {
        status = "error";
        message = "결제 세션 조회에 실패했습니다. 마이 페이지에서 플랜을 확인해 주세요.";
      }
    } else {
      status = "pending";
      message = "Stripe 가 설정되지 않았습니다. 관리자에게 문의해 주세요.";
    }
  }

  return (
    <PageShell breadcrumb="구독 · 결제 결과">
      <section className="rise-in mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 pt-10 text-center">
        <span className="text-[44px]" aria-hidden>
          {status === "ok" ? "🎉" : status === "pending" ? "⏳" : "⚠️"}
        </span>
        <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-ink">
          {status === "ok" ? "결제 완료" : status === "pending" ? "결제 확인 중" : "결제 안내"}
        </h1>
        <p className="text-sm leading-[1.6] text-text-2">{message}</p>
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
