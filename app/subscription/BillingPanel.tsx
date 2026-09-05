import Link from "next/link";
import {
  loadBillingHistory,
  PAYMENT_STATUS_LABEL,
  PAYMENT_PLAN_LABEL,
} from "@/lib/subscriptions/billing-history";
import { CancelRequestButton } from "./CancelRequestButton";
import { BillingAutopayCard } from "./BillingAutopayCard";
import { isTossBillingEnabled } from "@/lib/payments/toss-billing";
import { getLiveSubscriptionByEmail, toPublic } from "@/lib/payments/billing-store";
import { billingLabel } from "@/lib/subscriptions/labels";

/**
 * 구독 관리 · 결제 내역 (E1)
 *
 * 이 패널을 만든 이유는 기능이 모자라서가 아니라 **약속이 어긋나 있었기** 때문이다.
 * `/my` 는 유료 사용자에게 "결제일·플랜 변경·해지는 구독 페이지에서 관리해요"라고
 * 적어 두고 `/subscription` 으로 보냈는데, 그 페이지에는 요금제 카드와 비교표뿐이라
 * 결제일도, 플랜 변경도, 해지도 없었다. 보내 놓고 없는 것을 찾게 만드는 화면이었다.
 *
 * 그래서 없는 기능을 지어내지 않고, **있는 사실만** 이 자리에 모은다.
 *  1) 현재 플랜 — `profiles.plan` 이 단일 출처.
 *  2) 결제 내역 — `public.payments`. 현재 0행이므로 빈 상태 문구가 기본 화면이다.
 *  3) 해지·환불 경로 — 자동 해지 버튼은 없다. 있는 척하지 않고 실제로 동작하는
 *     경로(고객센터 1:1 문의 · "결제·환불" 카테고리)로 연결한다.
 *
 * **갱신일(만료일)을 표시하지 않는 이유**: 저장되는 곳이 없다.
 * `lib/billing/apply-plan-from-stripe.ts` 의 `applyPlanToUserByEmail()` 은
 * `profiles.plan` 만 갱신하고 만료 시각을 쓰지 않으며, `membership_expires_at`
 * 류의 컬럼은 레포 전체에 0건이다. 근거 없는 날짜를 "다음 결제일"이라고 적으면
 * 그건 화면이 아니라 허위 고지가 된다. 결제 시 선택한 기간은 아래 내역의
 * `billing` 값으로만 사실대로 보여 준다.
 */

const cell = "text-[12px] text-text-2";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtWon(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("ko-KR")}원`;
}

/* [966] 주기 표기는 lib/subscriptions/labels.billingLabel 단일 출처 */
const fmtBilling = billingLabel;

export async function BillingPanel({
  email,
  currentPlan,
  historyLimit = 10,
  planExpiresAt = null,
}: {
  email: string;
  currentPlan: "free" | "pro" | "expert";
  /** [966] ?history=50 로 더 보기 — 기본 10건 */
  historyLimit?: number;
  /** [966] app_users.plan_expires_at — 단건 이용권의 만료(남은 일수 표기) */
  planExpiresAt?: string | null;
}) {
  const limit = Math.min(Math.max(historyLimit, 10), 100);
  const { ok, payments } = await loadBillingHistory(email, limit);

  /* 자동결제(토스 빌링) 구독 — 있으면 상태·다음 결제일·해지 버튼을 보여 준다.
     next_charge_at 은 billing_subscriptions 에 실제로 저장되는 값이라 "근거 없는
     날짜" 문제가 없다. 빌링 미개방(전자계약 전) 상태에서는 조회 자체가 빈손이라
     아무것도 안 그린다. */
  const liveAutopay = await getLiveSubscriptionByEmail(email.trim().toLowerCase()).catch(
    () => null,
  );
  const autopay = liveAutopay ? toPublic(liveAutopay) : null;
  const billingOpen = isTossBillingEnabled();

  /* [966] 만료·남은 일수 — 예전엔 "만료일은 저장되지 않는다" 는 옛 사실에 묶여
     여기서 말하지 않았다. app_users.plan_expires_at 이 있고 /my 는 이미 보여 준다. */
  const expiry = planExpiresAt ? new Date(planExpiresAt) : null;
  const expiryValid = expiry !== null && Number.isFinite(expiry.getTime());
  const daysLeft = expiryValid
    ? Math.max(0, Math.ceil((expiry!.getTime() - Date.now()) / 86_400_000))
    : null;
  const expiryLabel = expiryValid
    ? expiry!.toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" })
    : null;

  const supportHref = (p: { orderId: string | null; amount: number | null; plan: string | null }) => {
    const q = new URLSearchParams({ category: "payment" });
    if (p.orderId) q.set("order", p.orderId);
    if (p.amount != null) q.set("amount", String(p.amount));
    if (p.plan) q.set("plan", p.plan);
    return `/support?${q}`;
  };

  return (
    <section
      id="billing"
      className="rise-in-3 card mx-auto mt-8 w-full max-w-[1080px] scroll-mt-24 rounded-[18px] px-[22px] py-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-section text-ink">구독 관리 · 결제 내역</h2>
        <span className="t-sub text-text-3">
          현재 플랜 · {PAYMENT_PLAN_LABEL[currentPlan] ?? currentPlan}
          {currentPlan !== "free" && expiryLabel && !autopay
            ? ` · ${expiryLabel}까지${daysLeft !== null ? ` (${daysLeft}일 남음)` : ""}`
            : ""}
        </span>
      </div>

      <div className="mt-3">
        {!ok ? (
          /* 조회 실패를 "내역 없음"으로 보여 주면, 결제한 사람이 자기 기록이
             사라졌다고 오해한다. 두 상태는 반드시 구분한다. */
          <div className="rounded-xl bg-[rgba(242,201,76,.08)] px-4 py-5 t-sub text-text-2">
            결제 내역을 지금 불러오지 못했어요. 잠시 후 새로고침해 주세요 — 결제 기록이
            사라진 것은 아닙니다.
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-xl bg-[rgba(0,0,0,.02)] px-4 py-6 text-center t-sub text-text-3">
            아직 결제 내역이 없어요.
            <br />
            결제가 완료되면 금액·이용 기간·영수증 링크가 여기에 쌓입니다.
          </div>
        ) : (
          <>
            {/* [966] 모바일 — 6열 가로 스크롤 표 대신 카드형 */}
            <ul className="flex flex-col gap-2 md:hidden">
              {payments.map((p) => (
                <li key={p.id} className="rounded-xl border border-line px-3.5 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="t-body font-bold text-ink">
                      {p.plan ? (PAYMENT_PLAN_LABEL[p.plan] ?? p.plan) : "—"} · {fmtBilling(p.billing)}
                    </span>
                    <span className="t-body font-extrabold text-ink t-num">{fmtWon(p.amount)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 t-sub text-text-3">
                    <span>{fmtDate(p.paidAt ?? p.requestedAt)}</span>
                    <StatusChip status={p.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 t-sub">
                    <ReceiptCell p={p} supportHref={supportHref} />
                    {p.status === "paid" && (
                      <Link href={supportHref(p)} className="font-bold text-text-2 underline underline-offset-2">
                        환불·문의
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {/* 데스크톱 — 표 */}
            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[680px]">
                <div className="grid grid-cols-[130px_110px_90px_90px_110px_1fr_90px] gap-2 border-b border-divider pb-2 t-sub text-text-3">
                  <span>결제일</span>
                  <span>플랜</span>
                  <span>기간</span>
                  <span>금액</span>
                  <span>상태</span>
                  <span>영수증</span>
                  <span />
                </div>
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-[130px_110px_90px_90px_110px_1fr_90px] items-center gap-2 border-b border-divider py-2.5"
                  >
                    <span className={cell}>{fmtDate(p.paidAt ?? p.requestedAt)}</span>
                    <span className={cell}>
                      {p.plan ? (PAYMENT_PLAN_LABEL[p.plan] ?? p.plan) : "—"}
                    </span>
                    <span className={cell}>{fmtBilling(p.billing)}</span>
                    <span className={`${cell} font-bold text-ink t-num`}>{fmtWon(p.amount)}</span>
                    <span className={cell}>
                      <StatusChip status={p.status} />
                    </span>
                    <span className={cell}>
                      <ReceiptCell p={p} supportHref={supportHref} />
                    </span>
                    <span className={`${cell} text-right`}>
                      {p.status === "paid" && (
                        <Link href={supportHref(p)} className="font-bold text-text-2 underline underline-offset-2">
                          환불·문의
                        </Link>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* [966] 10건 고정이던 것을 더 보기로 — 연간 갱신 사용자는 과거를 볼 길이 없었다 */}
            {payments.length >= limit && limit < 100 && (
              <div className="mt-2 text-right">
                <Link
                  href={`/subscription?history=${Math.min(limit + 40, 100)}#billing`}
                  className="t-sub font-bold text-primary underline underline-offset-2"
                >
                  이전 결제 더 보기
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* 자동결제 이용 중이면 상태 카드(다음 결제일·해지)를 먼저 보여 준다 */}
      {autopay && (
        <div className="mt-4">
          <BillingAutopayCard
            plan={autopay.plan}
            billing={autopay.billing}
            amount={autopay.amount}
            status={autopay.status}
            cardCompany={autopay.cardCompany}
            cardNumberMasked={autopay.cardNumberMasked}
            nextChargeAt={autopay.nextChargeAt}
            planExpiresAt={expiryValid ? expiry!.toISOString() : null}
          />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 rounded-xl bg-[rgba(29,79,216,.04)] px-4 py-3">
        <div className="t-sub font-extrabold text-ink">플랜 변경 · 해지 · 환불</div>
        {autopay ? (
          /* [966] 자동결제 이용자에게 "자동결제 해지"(즉시)와 "해지 요청하기"(티켓)가 함께
             보였다 — 두 버튼이 같은 일을 다르게 하는 것처럼 읽힌다. 자동결제는 위 카드에서 즉시. */
          <p className="t-sub text-text-2">
            자동결제 해지는 <b>위 자동결제 카드의 해지 버튼</b>으로 즉시 처리돼요 — 다음 결제일에
            청구되지 않고, 이미 결제한 기간은 만료일까지 이용할 수 있어요. 결제 후 7일 이내
            청약철회(환불)는 결제 내역의 <b>환불·문의</b>로 접수해 주세요. 처리 기준은{" "}
            <Link href="/legal/terms#refund" className="font-bold text-primary underline underline-offset-2">
              약관 제8조
            </Link>
            .
          </p>
        ) : (
          <p className="t-sub text-text-2">
            {currentPlan !== "free" && expiryLabel ? (
              <>
                지금 이용권은 <b>{expiryLabel}까지</b>이고 자동 반복청구가 없어 그 뒤에는 추가
                청구 없이 무료 플랜으로 돌아가요.{" "}
              </>
            ) : null}
            환불(결제 후 7일 이내 청약철회)·문의는 결제 내역의 <b>환불·문의</b> 또는{" "}
            <Link href="/support?category=payment" className="font-bold text-primary underline underline-offset-2">
              고객센터
            </Link>
            로 접수해 주세요. 접수 후 <b>영업일 1일 이내</b> 확인 안내. 처리 기준은{" "}
            <Link href="/legal/terms#refund" className="font-bold text-primary underline underline-offset-2">
              약관 제8조
            </Link>
            .
          </p>
        )}
        {billingOpen && !autopay && currentPlan !== "free" && (
          <p className="t-sub text-text-2">
            매번 결제하기 번거롭다면{" "}
            <Link
              href={`/subscription/billing?tier=${currentPlan}&billing=monthly`}
              className="font-bold text-primary underline underline-offset-2"
            >
              자동결제 등록
            </Link>
            으로 전환할 수 있어요.
          </p>
        )}
        {!autopay && currentPlan !== "free" && (
          <CancelRequestButton currentPlan={currentPlan} expiresAtLabel={expiryLabel} />
        )}
        <p className="t-sub text-text-3">
          상위 플랜으로 올리는 것은 위 요금제 카드에서 바로 결제하면 적용됩니다.
        </p>
      </div>
    </section>
  );
}

const STATUS_TONE: Record<string, string> = {
  paid: "bg-primary-soft text-primary",
  done: "bg-primary-soft text-primary",
  requested: "bg-bg text-text-2",
  failed: "bg-danger-soft text-danger",
  cancelled: "bg-bg text-text-3",
  canceled: "bg-bg text-text-3",
  refunded: "bg-warning-soft text-warning",
};

function StatusChip({ status }: { status: string | null }) {
  if (!status) return <span className="text-text-3">—</span>;
  const tone = STATUS_TONE[status] ?? "bg-bg text-text-2";
  return (
    <span className={`inline-block rounded-md px-1.5 py-px t-caption font-bold ${tone}`}>
      {PAYMENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/* [966] 영수증이 없으면 이유 없는 "—" 대신 안내 — 매출전표는 토스 승인 응답에 있을 때만
   저장된다(카카오페이·빌링 갱신 건은 비어 있을 수 있다). */
function ReceiptCell({
  p,
  supportHref,
}: {
  p: { orderId: string | null; amount: number | null; plan: string | null; receiptUrl: string | null; status: string | null };
  supportHref: (p: { orderId: string | null; amount: number | null; plan: string | null }) => string;
}) {
  if (p.receiptUrl) {
    return (
      <a
        href={p.receiptUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-primary underline underline-offset-2"
      >
        영수증 보기
      </a>
    );
  }
  if (p.status === "paid") {
    return (
      <Link href={supportHref(p)} className="text-text-3 underline underline-offset-2" title="이 결제는 매출전표 링크가 저장되지 않았어요. 고객센터에 요청하면 발급해 드려요.">
        영수증 요청
      </Link>
    );
  }
  return <span className="text-text-3">—</span>;
}
