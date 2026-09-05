import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getPaymentByOrderId, type PaymentRecord } from "@/lib/payments/store";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { paymentReceiptEmail, paymentRefundEmail } from "@/lib/email/templates";
import { billingLabel, planLabel } from "@/lib/subscriptions/labels";
import { logger } from "@/lib/log";

/**
 * [966] 결제 **직후** 확인 — 알림함 1건 + 영수증 메일 1통.
 *
 * 결제 직전 고지(기간·자동갱신·환불)는 촘촘한데 직후가 비어 있었다: 완료 화면
 * 한 번이 전부였고 메일도 알림도 없었다. 사용자는 카드사 알림 말고는 아무 기록도
 * 갖지 못했다.
 *
 * 중복 방지: 같은 주문에 두 번 보내지 않도록 payments.metadata.receiptNotifiedAt 을
 * 선점한다(승인 재시도·웹훅 재전송·복구 경로가 같은 주문으로 여러 번 들어온다).
 * 목업 결제(MOCK-PAYMENT-KEY)는 보내지 않는다.
 */
export async function notifyPaymentSettled(
  paid: PaymentRecord,
  opts: { kind?: "one_off" | "billing_first" | "renewal"; nextChargeAt?: string | null } = {},
): Promise<void> {
  try {
    if (!paid.userEmail) return;
    if ((paid.providerPaymentKey ?? "").startsWith("MOCK")) return;
    const sb = getServiceSupabase();
    if (!sb) return;

    /* 선점 — metadata 에 표식이 없을 때만 갱신되게 조건을 건다 */
    const fresh = await getPaymentByOrderId(paid.orderId);
    if (!fresh || fresh.status !== "paid") return;
    if (fresh.metadata && typeof fresh.metadata.receiptNotifiedAt === "string") return;
    const stamp = new Date().toISOString();
    const { data: claimed, error: claimErr } = await sb
      .from("payments")
      .update({ metadata: { ...(fresh.metadata ?? {}), receiptNotifiedAt: stamp } })
      .eq("order_id", paid.orderId)
      .eq("status", "paid")
      .is("metadata->>receiptNotifiedAt", null)
      .select("id")
      .maybeSingle();
    if (claimErr || !claimed) return;

    const email = paid.userEmail.trim().toLowerCase();
    const plan = planLabel(paid.plan);
    const period =
      opts.kind === "renewal"
        ? `${billingLabel(paid.billing)} 자동결제 갱신`
        : opts.kind === "billing_first"
          ? `${billingLabel(paid.billing)} 자동결제`
          : billingLabel(paid.billing);

    /* 이용 종료일은 적용 결과(app_users.plan_expires_at)를 읽는다 — 연장 규칙이 있어
       기간 숫자로 계산하면 틀릴 수 있다 */
    let endsAt: Date | null = null;
    const { data: u } = await sb
      .from("app_users")
      .select("plan_expires_at")
      .eq("email", email)
      .maybeSingle();
    const exp = (u as { plan_expires_at?: string | null } | null)?.plan_expires_at;
    if (exp) {
      const d = new Date(exp);
      if (Number.isFinite(d.getTime())) endsAt = d;
    }
    const endsLabel = endsAt
      ? endsAt.toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" })
      : null;

    await appendInboxNotification({
      userEmail: email,
      title: opts.kind === "renewal" ? "자동결제가 갱신됐어요" : "결제가 완료됐어요",
      body: `${plan} ${period} · ${paid.amount.toLocaleString("ko-KR")}원${endsLabel ? ` · ${endsLabel}까지 이용` : ""}`,
      actionUrl: "/my",
      channel: "user",
    });

    if (isEmailConfigured()) {
      const paidAt = paid.paidAt ? new Date(paid.paidAt) : new Date();
      const result = await sendEmail({
        to: email,
        ...paymentReceiptEmail({
          planLabel: plan,
          periodLabel: period,
          amountKrw: paid.amount,
          paidAt: Number.isFinite(paidAt.getTime()) ? paidAt : new Date(),
          orderId: paid.orderId,
          endsAt,
          receiptUrl: paid.receiptUrl ?? fresh.receiptUrl ?? null,
          nextChargeAt: opts.nextChargeAt ? new Date(opts.nextChargeAt) : null,
        }),
      });
      if (!result.sent) {
        logger.warn("[payments:notify] 영수증 메일 발송 실패", { orderId: paid.orderId, reason: result.reason });
      }
    }
  } catch (e) {
    /* 통보 실패가 결제 반영을 막으면 안 된다 */
    logger.warn("[payments:notify] 결제 확인 통보 실패", {
      orderId: paid.orderId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/** [966] 환불(관리자 취소) 통보 — 알림함 + 메일. 예전엔 조용히 free 로 내려갔다. */
export async function notifyPaymentRefunded(
  rec: PaymentRecord,
  opts: { refundedKrw: number; partial: boolean; reason?: string | null },
): Promise<void> {
  try {
    if (!rec.userEmail) return;
    const email = rec.userEmail.trim().toLowerCase();
    const plan = planLabel(rec.plan);
    const period = billingLabel(rec.billing);
    await appendInboxNotification({
      userEmail: email,
      title: opts.partial ? "부분 환불이 처리됐어요" : "환불이 처리됐어요",
      body: `${plan} ${period} · ${opts.refundedKrw.toLocaleString("ko-KR")}원 — 결제 수단으로 3~7영업일 안에 돌아가요.${opts.partial ? "" : " 이용권은 무료 플랜으로 돌아갑니다."}`,
      actionUrl: "/subscription#billing",
      channel: "user",
    });
    if (isEmailConfigured()) {
      await sendEmail({
        to: email,
        ...paymentRefundEmail({
          planLabel: plan,
          periodLabel: period,
          refundedKrw: opts.refundedKrw,
          partialOfKrw: opts.partial ? rec.amount : null,
          orderId: rec.orderId,
          reason: opts.reason ?? null,
        }),
      });
    }
  } catch (e) {
    logger.warn("[payments:notify] 환불 통보 실패", {
      orderId: rec.orderId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
