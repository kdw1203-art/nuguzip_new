import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { markPaid, getPaymentByOrderId, type PaymentRecord } from "@/lib/payments/store";
import {
  getLiveSubscriptionByEmail,
  toPublic,
  type PublicBillingSubscription,
} from "@/lib/payments/billing-store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import { getStripe } from "@/lib/billing/stripe";
import { normalizePlan } from "@/lib/billing/plan";
import { safeAuth } from "@/lib/safe-auth";
import { PaymentSuccessMoment } from "./PaymentSuccessMoment";
import type { AppPlan } from "@/lib/billing/plan";

export const metadata: Metadata = {
  title: "결제 완료 | 누구집",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * 결제 성공 랜딩 통합(감사 P1-4): 토스·카카오페이(orderId·paymentKey) +
 * Stripe(provider=stripe&session_id — 구 /billing/success 흡수, 미들웨어가 1홉 리다이렉트).
 * Stripe 는 Webhook 과 병행해 session_id 로 플랜을 idempotent 하게 반영합니다.
 */
export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    orderId?: string;
    paymentKey?: string;
    amount?: string;
    provider?: string;
    session_id?: string;
    source?: string;
    campaign?: string;
    card?: string;
  }>;
}) {
  const sp = await searchParams;
  const orderId = sp.orderId;
  const paymentKey = sp.paymentKey;
  const amount = sp.amount ? Number(sp.amount) : null;

  let status: "ok" | "mock" | "error" = "error";
  let message = "결제 정보를 확인할 수 없습니다.";

  if (sp.provider === "stripe") {
    // Stripe Checkout 성공 리턴 (구 /billing/success) — session_id 로 백업 검증
    const sessionId = sp.session_id?.trim();
    message = "결제 세션을 확인할 수 없습니다. 마이 페이지에서 플랜을 확인해 주세요.";
    if (sessionId) {
      const stripe = getStripe();
      if (stripe) {
        try {
          const checkout = await stripe.checkout.sessions.retrieve(sessionId);
          if (checkout.payment_status === "paid" || checkout.status === "complete") {
            /* 플랜은 **로그인된 본인 세션 이메일** 을 기준으로만 반영한다.
               예전엔 checkout.metadata.email 을 먼저 신뢰해서, 남의 session_id 를
               주소창에 넣고 열면 그 사람 플랜이 올라가는 그리핑이 가능했다.
               결제 세션의 이메일과 로그인 세션 이메일이 다르면(또는 비로그인이면)
               여기서는 반영하지 않고, 서명 검증된 웹훅이 권위 있게 처리하게 둔다. */
            const auth = await safeAuth();
            const sessionEmail = (auth?.user?.email ?? "").trim().toLowerCase();
            const checkoutEmail = String(
              checkout.metadata?.email ||
                checkout.customer_details?.email ||
                checkout.customer_email ||
                "",
            )
              .trim()
              .toLowerCase();
            const plan = normalizePlan(checkout.metadata?.plan);
            if (
              sessionEmail &&
              plan !== "free" &&
              (!checkoutEmail || checkoutEmail === sessionEmail)
            ) {
              await applyPlanToUserByEmail(sessionEmail, plan);
            }
            status = "ok";
            message = "구독 결제가 완료되었습니다. 잠시 후 마이 페이지에서 플랜을 확인해 주세요.";
          } else {
            status = "mock";
            message = "결제 확인 중입니다. Webhook 반영까지 1~2분 걸릴 수 있습니다.";
          }
        } catch {
          message = "결제 세션 조회에 실패했습니다. 마이 페이지에서 플랜을 확인해 주세요.";
        }
      } else {
        status = "mock";
        message = "Stripe 가 설정되지 않았습니다. 관리자에게 문의해 주세요.";
      }
    }
  } else if (sp.provider === "toss-billing" && sp.card === "changed") {
    /* 카드 변경(재등록) — 결제 없이 빌링키·카드만 교체된 경우. 사실 확인은
       아래 자동결제 정보 카드가 서버 저장값(구독 행)으로 한다. */
    status = "ok";
    message = "결제 카드가 변경됐어요. 다음 결제부터 새 카드로 청구됩니다.";
  } else if (sp.provider === "toss-billing" && orderId) {
    /* 자동결제 등록 — 발급·첫 결제·활성화는 /api/payments/toss/billing/register 가
       서버에서 이미 끝냈다. 화면은 원장 기록으로만 사실을 확인한다(쿼리스트링을
       믿지 않는 기존 원칙 그대로). */
    const rec = await getPaymentByOrderId(orderId).catch(() => null);
    if (rec?.status === "paid") {
      status = "ok";
      message = "자동결제 등록과 첫 결제가 완료됐어요. 다음 결제부터는 등록한 카드로 자동으로 진행돼요.";
    } else {
      message = "자동결제 등록 결과를 확인할 수 없어요. 구독 페이지에서 상태를 확인해 주세요.";
    }
  } else if (sp.provider === "kakaopay" && orderId) {
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
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        status = "ok";
        message = "결제가 완료되어 구독이 활성화됐습니다.";
      } else {
        message = data.error ?? message;
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
            // 목업 재확정도 일회성 결제 경로 — 실제 경로와 같은 이용 기간을 기록한다
            await applyPlanToUserByEmail(session.user.email, plan, {
              durationDays: paid.billing === "annual" ? 365 : 30,
            });
          }
        }
        status = "mock";
        message = "결제가 기록되었습니다. (테스트 모드)";
      }
    }
  }

  const ok = status !== "error";

  /* 자동결제 안내 카드 재료 — 등록 카드·다음 결제일도 서버 저장값(구독 행)으로만
     그린다(쿼리스트링 불신 원칙 동일). 등록 직후·카드 변경 직후 화면에서
     "등록 카드·적용 플랜·다음 결제일"이 한눈에 확인된다. */
  let billingSub: PublicBillingSubscription | null = null;
  if (ok && sp.provider === "toss-billing") {
    const session = await safeAuth();
    const email = session?.user?.email?.trim().toLowerCase();
    if (email) {
      const live = await getLiveSubscriptionByEmail(email).catch(() => null);
      if (live) billingSub = toPublic(live);
    }
  }

  /* 영수증 카드 재료 — 주문 기록에서 읽는다. 화면에 보이는 값은 전부 서버에
     저장된 값이다. 쿼리스트링의 amount 를 그대로 그리면 주소창을 고친 값이
     "결제 완료 5,900원"처럼 보일 수 있다. */
  let record: PaymentRecord | null = null;
  if (ok && orderId) {
    record = await getPaymentByOrderId(orderId).catch(() => null);
  }
  const PLAN_LABEL: Record<string, string> = {
    basic: "베이직",
    pro: "플러스",
    expert: "프로 (전문가)",
    enterprise: "엔터프라이즈",
  };
  const METHOD_LABEL: Record<string, string> = {
    "카드": "카드 (토스페이먼츠)",
    "카드(자동결제)": "카드 자동결제 (토스페이먼츠)",
    "mock-card": "테스트 결제",
  };
  const receiptRows: { label: string; value: string }[] = record
    ? [
        {
          label: "플랜",
          value: `${PLAN_LABEL[record.plan] ?? record.plan} · ${
            record.billing === "annual" ? "연간" : record.billing === "weekly" ? "주간권(7일)" : "월간"
          }`,
        },
        {
          label: "결제 금액",
          value: `${record.amount.toLocaleString("ko-KR")}원`,
        },
        ...(record.method
          ? [{ label: "결제 수단", value: METHOD_LABEL[record.method] ?? record.method }]
          : []),
        ...(record.paidAt
          ? [{ label: "결제 일시", value: record.paidAt.slice(0, 16).replace("T", " ") }]
          : []),
      ]
    : [];

  return (
    <PageShell breadcrumb="구독 · 결제 결과">
      <PaymentSuccessMoment status={status} />
      <section className="rise-in mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 pt-10 text-center">
        {/* 체크 배지 — 이모지 대신 브랜드 색 원형. 실패면 경고색. */}
        <span
          aria-hidden
          className={`flex h-16 w-16 items-center justify-center rounded-full text-[30px] text-white shadow-[0_10px_28px_rgba(16,28,54,.18)] ${
            ok ? "bg-primary" : "bg-danger"
          }`}
        >
          {ok ? "✓" : "!"}
        </span>
        <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-ink">
          {ok ? "결제가 완료되었습니다" : "결제 확인에 실패했습니다"}
        </h1>
        <p className="text-sm leading-[1.6] text-text-2">{message}</p>

        {/* 영수증 카드 — 무엇을 얼마에 샀는지 이 화면에서 확인된다.
            예전에는 "완료되었습니다" 한 줄과 주문번호뿐이라, 방금 얼마가
            나갔는지 보려면 카드사 알림을 열어야 했다. */}
        {receiptRows.length > 0 && (
          <div className="mt-2 w-full overflow-hidden rounded-[18px] border border-line bg-surface text-left shadow-[0_8px_24px_rgba(16,28,54,.06)]">
            <div className="border-b border-dashed border-[#dfe5ee] px-5 py-3.5">
              <div className="text-[11px] font-bold text-text-3">결제 내역</div>
            </div>
            <dl className="flex flex-col gap-2.5 px-5 py-4">
              {receiptRows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] text-text-3">{r.label}</dt>
                  <dd className="text-[13px] font-extrabold text-ink">{r.value}</dd>
                </div>
              ))}
              {orderId && (
                <div className="flex items-baseline justify-between gap-3 border-t border-[#f0f3f8] pt-2.5">
                  <dt className="text-[11px] text-text-3">주문번호</dt>
                  <dd className="break-all text-right text-[11px] text-text-3">{orderId}</dd>
                </div>
              )}
            </dl>
            {record?.receiptUrl && (
              <a
                href={record.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="block border-t border-line bg-[#f7f9fd] px-5 py-3 text-center text-[12px] font-extrabold text-primary"
              >
                매출전표(영수증) 보기 ›
              </a>
            )}
          </div>
        )}
        {receiptRows.length === 0 && orderId && (
          <p className="text-xs text-text-3">주문번호 {orderId}</p>
        )}

        {/* 자동결제 정보 — 등록 완료·카드 변경 화면의 핵심 확인값 */}
        {billingSub && (
          <div className="w-full overflow-hidden rounded-[18px] border border-line bg-surface text-left shadow-[0_8px_24px_rgba(16,28,54,.06)]">
            <div className="border-b border-dashed border-[#dfe5ee] px-5 py-3.5">
              <div className="text-[11px] font-bold text-text-3">자동결제 정보</div>
            </div>
            <dl className="flex flex-col gap-2.5 px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[12px] text-text-3">적용 플랜</dt>
                <dd className="text-[13px] font-extrabold text-ink">
                  {PLAN_LABEL[billingSub.plan] ?? billingSub.plan} ·{" "}
                  {billingSub.billing === "annual" ? "연간" : "월간"} 자동결제
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[12px] text-text-3">등록 카드</dt>
                <dd className="text-[13px] font-extrabold text-ink">
                  {billingSub.cardCompany || billingSub.cardNumberMasked
                    ? `${billingSub.cardCompany ?? "카드"} ${billingSub.cardNumberMasked ?? ""}`.trim()
                    : "카드"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[12px] text-text-3">결제 금액</dt>
                <dd className="text-[13px] font-extrabold text-ink">
                  {billingSub.amount.toLocaleString("ko-KR")}원 /{" "}
                  {billingSub.billing === "annual" ? "년" : "월"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-[#f0f3f8] pt-2.5">
                <dt className="text-[12px] text-text-3">다음 결제일</dt>
                <dd className="text-[13px] font-extrabold text-ink">
                  {billingSub.nextChargeAt
                    ? new Date(billingSub.nextChargeAt).toLocaleDateString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="border-t border-line bg-[#f7f9fd] px-5 py-3 text-[11px] leading-[1.6] text-text-3">
              해지·카드 변경은 구독 페이지의 구독 관리에서 언제든 가능해요 — 해지하면 다음
              결제일에 청구되지 않아요.
            </p>
          </div>
        )}

        <div className="mt-3 flex w-full flex-col gap-2.5">
          <Link href="/my" className="btn-primary rounded-[14px] p-[13px] text-center text-sm font-bold">
            마이 페이지에서 플랜 확인
          </Link>
          <Link
            href="/subscription"
            className="rounded-[14px] border border-line bg-surface p-[13px] text-center text-sm font-bold text-text-1"
          >
            멤버십 안내
          </Link>
        </div>
        {ok && (
          <p className="mt-1 text-[11px] leading-[1.6] text-text-3">
            결제 7일 이내 청약철회(환불)가 가능합니다 ·{" "}
            <Link href="/legal/terms#refund" className="underline underline-offset-2">
              환불 규정
            </Link>
          </p>
        )}
      </section>
    </PageShell>
  );
}
